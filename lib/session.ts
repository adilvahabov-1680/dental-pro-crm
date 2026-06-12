/**
 * Сессия = подписанный JWT в httpOnly cookie.
 * Файл edge-safe (только jose) — его импортирует middleware.ts.
 * Prisma здесь запрещена.
 */
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/types/auth";

export const SESSION_COOKIE = "dp_session";
export const SESSION_TTL = "12h";

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "dev-only-secret-do-not-use-in-production",
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.user as SessionUser) ?? null;
  } catch {
    return null;
  }
}
