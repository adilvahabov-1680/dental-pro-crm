/**
 * DB health check — проверяет подключение к Postgres.
 * GET /api/health/db → { ok: true, db: "connected" }
 *                   → { ok: false, db: "disconnected", error: "..." } (503)
 * Без авторизации (для monitoring/alerting).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "disconnected", error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
