/**
 * Server-side auth-хелперы (Server Components / Server Actions).
 * Edge-safe часть (JWT) — в lib/session.ts.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey, SessionUser } from "@/types/auth";
import type { PermissionKey } from "@/types/permissions";

/** Текущий пользователь из сессии (кэш на время запроса). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/** Требует входа; иначе redirect на /login. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Требует одну из ролей; иначе redirect на /dashboard. */
export async function requireRole(...roles: RoleKey[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

/** Требует permission; иначе redirect на /dashboard. */
export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasPermission(user, key)) redirect("/dashboard");
  return user;
}
