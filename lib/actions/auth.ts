"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";
import { resolveEffectivePermissions, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { DEMO_USERS, DEMO_PASSWORD, buildDemoSessionUser } from "@/lib/constants";
import type { LoginState, RoleKey, SessionUser } from "@/types/auth";

async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function login(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "invalid" };

  let sessionUser: SessionUser | null = null;

  if (process.env.AUTH_MOCK === "true") {
    // ───────────────────────────────────────────────────────
    // ВРЕМЕННО: mock-вход без БД (см. lib/constants.ts).
    // Удалить эту ветку после применения миграций и seed.
    // ───────────────────────────────────────────────────────
    const demo = DEMO_USERS.find((u) => u.email === email);
    if (demo && password === DEMO_PASSWORD) sessionUser = buildDemoSessionUser(demo);
  } else {
    // Реальная ветка: Prisma + bcrypt-хэш
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        extraPermissions: { include: { permission: true } },
        doctorProfile: { select: { id: true } },
        assistantProfile: { select: { assignedDoctorId: true } },
      },
    });
    if (user && user.isActive && !user.deletedAt) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (ok) {
        const roleKey = user.role.key as RoleKey;
        const rolePerms = user.role.permissions.length
          ? user.role.permissions.map((rp) => rp.permission.key)
          : DEFAULT_ROLE_PERMISSIONS[roleKey];
        const personal = user.extraPermissions.map((up) => ({
          key: up.permission.key,
          allowed: up.allowed,
        }));
        sessionUser = {
          id: user.id,
          clinicId: user.clinicId,
          role: roleKey,
          doctorId: user.doctorProfile?.id ?? null,
          assignedDoctorId: user.assistantProfile?.assignedDoctorId ?? null,
          fullName: user.fullName,
          email: user.email,
          locale: user.locale as SessionUser["locale"],
          permissions: resolveEffectivePermissions(rolePerms, personal),
        };
      }
    }
  }

  if (!sessionUser) return { error: "invalid" };

  await setSessionCookie(sessionUser);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
