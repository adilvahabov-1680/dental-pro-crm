/**
 * Health check (сессия 20) — для reverse proxy / process manager.
 * Без авторизации, без БД (статичный ответ — не должен зависеть от
 * состояния Postgres, чтобы не плодить false-positive restart'ы).
 * GET /api/health → { ok: true, service: "dental-pro-crm" }
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "dental-pro-crm" });
}
