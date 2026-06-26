/**
 * Отдача аватара пользователя (сессия 83). Авторизация решается ВНУТРИ
 * маршрута (не middleware — см. middleware.ts): без сессии → 403.
 * Чтение: своя клиника (включая себя) или super_admin — любой пользователь;
 * чужая клиника → 404 (без утечки факта существования, как и в
 * /api/clinic-logo/[clinicId] и /api/documents/[id]/download).
 * Путь к файлу — ТОЛЬКО из БД (user.avatarUrl), без user input в пути;
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
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { clinicId: true, avatarUrl: true },
  });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // tenant-изоляция на чтение: своя клиника (включая себя) или super_admin;
  // чужая клиника → 404, без утечки факта существования пользователя.
  if (user.role !== "super_admin" && target.clinicId !== user.clinicId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!target.avatarUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readUploadFile(target.avatarUrl);
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
