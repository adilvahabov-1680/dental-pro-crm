/**
 * DB health check — проверяет подключение к Postgres.
 * GET /api/health/db → { ok: true, db: "connected" }
 *                   → { ok: false, db: "disconnected", error: "db_unreachable" } (503)
 * Без авторизации (для monitoring/alerting). Production hardening (сессия 48):
 * реальный текст ошибки Prisma (может содержать внутренний host/порт БД) идёт
 * только в server-лог, не в публичный ответ — этот route без auth.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (e) {
    console.error("health/db check failed:", e);
    return NextResponse.json({ ok: false, db: "disconnected", error: "db_unreachable" }, { status: 503 });
  }
}
