/**
 * Сессия = подписанный JWT в httpOnly cookie.
 * Файл edge-safe (только jose) — его импортирует middleware.ts.
 * Prisma здесь запрещена.
 */
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/types/auth";

export const SESSION_COOKIE = "dp_session";
export const SESSION_TTL = "12h";

/**
 * Production hardening (сессия 48): без SESSION_SECRET в production JWT
 * подписывался бы публично известной dev-строкой из этого репозитория —
 * любой мог бы подделать сессию. Fail fast вместо silent insecure fallback.
 * В development/test секрет не обязателен — есть insecure-фолбэк для удобства.
 */
function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production (see .env.example)");
  }
  return new TextEncoder().encode(value ?? "dev-only-secret-do-not-use-in-production");
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
