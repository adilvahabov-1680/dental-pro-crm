"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";
import { resolveEffectivePermissions, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { DEMO_USERS, DEMO_PASSWORD, buildDemoSessionUser } from "@/lib/constants";
import { isLoginLocked, registerFailedLogin, resetLoginAttempts } from "@/lib/login-rate-limit";
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

// Static aliases for demo convenience: "admin" / "super" → full emails.
// Safe: alias resolves only if the user exists with the correct password.
const LOGIN_ALIASES: Record<string, string> = {
  admin: "admin@demo.dentalpro.az",
  super: "super@demo.dentalpro.az",
};

// Resolve a short alias or email input to a full email.
// Also checks PLATFORM_OWNER_LOGIN → PLATFORM_OWNER_EMAIL at runtime (no rebuild needed).
function resolveLoginEmail(raw: string): string {
  if (raw.includes("@")) return raw;
  if (LOGIN_ALIASES[raw]) return LOGIN_ALIASES[raw];
  const ownerLogin = process.env.PLATFORM_OWNER_LOGIN;
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL;
  if (ownerLogin && ownerEmail && raw === ownerLogin) return ownerEmail;
  return raw;
}

export async function login(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = resolveLoginEmail(raw);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "invalid" };

  // Сессия 104: brute-force throttling — см. lib/login-rate-limit.ts для
  // полного объяснения дизайна/tradeoff'ов (in-memory, по email, не IP).
  if (isLoginLocked(email)) return { error: "rateLimited" };

  let sessionUser: SessionUser | null = null;

  // Production hardening (сессия 48): AUTH_MOCK игнорируется в production,
  // даже если переменная окружения случайно оставлена true — иначе это
  // вход с захардкоженным паролем без проверки БД (см. .env.example).
  const authMockEnabled =
    process.env.AUTH_MOCK === "true" && process.env.NODE_ENV !== "production";

  if (authMockEnabled) {
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
        clinic: { select: { status: true } },
      },
    });
    if (user && user.isActive && !user.deletedAt) {
      // Block login for users of suspended clinics (super_admin has no clinic)
      if (user.clinic?.status === "suspended") return { error: "clinicSuspended" };
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

  if (!sessionUser) {
    registerFailedLogin(email);
    return { error: "invalid" };
  }

  resetLoginAttempts(email);
  await setSessionCookie(sessionUser);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
