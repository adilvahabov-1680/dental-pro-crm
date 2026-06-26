/**
 * Отдача логотипа клиники (сессия 81). Авторизация решается ВНУТРИ маршрута
 * (не middleware — см. middleware.ts): без сессии → 403; клиничный
 * пользователь видит только лого своей клиники (user.clinicId), чужая
 * клиника отдаёт 404 (без утечки факта существования, как и в
 * /api/documents/[id]/download); super_admin — любая клиника (платформенное
 * управление, см. /platform/clinics/[id]).
 * Путь к файлу — ТОЛЬКО из БД (clinic.logoUrl), без user input в пути;
 * resolveUploadPath (lib/storage.ts) дополнительно отсекает path traversal —
 * клиенту никогда не передаётся и не виден локальный путь.
 * mime — пересниффается по факту (та же логика валидации при загрузке,
 * включая отказ SVG), а не хранится отдельным полем (без миграции схемы).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUploadFile } from "@/lib/storage";
import { sniffUploadMime } from "@/lib/validation/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { clinicId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // tenant-изоляция на чтение: клиничный пользователь — только своя клиника;
  // super_admin управляет логотипами любой клиники из /platform.
  if (user.role !== "super_admin" && user.clinicId !== clinicId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, deletedAt: null },
    select: { logoUrl: true },
  });
  if (!clinic?.logoUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readUploadFile(clinic.logoUrl);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const mime = sniffUploadMime(file) ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}
