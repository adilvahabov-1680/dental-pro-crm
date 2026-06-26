/**
 * Отдача подписи врача (сессия 86). Авторизация решается ВНУТРИ маршрута
 * (не middleware — см. middleware.ts): без сессии → 403.
 * Чтение УЖЕ ограничено относительно аватара/лого ввиду чувствительности
 * подписи (используется на документах в будущих сессиях): сам врач — свою;
 * owner/admin (admin.view) своей клиники — любого врача клиники;
 * super_admin — любого. Остальные роли клиники (doctor чужой/assistant/
 * reception/accountant) — нет, даже в пределах своей клиники, пока нет
 * конкретной UI-потребности (нет ни интеграции в PDF, ни общего списка
 * подписей). Чужая клиника / нет такого врача → 404 (без утечки факта
 * существования). Путь к файлу — ТОЛЬКО из БД (doctor.signatureUrl), без
 * user input в пути; resolveUploadPath (lib/storage.ts) дополнительно
 * отсекает path traversal. mime — пересниффается по факту (та же логика
 * валидации при загрузке, включая отказ SVG), а не хранится отдельным полем.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readUploadFile } from "@/lib/storage";
import { sniffUploadMime } from "@/lib/validation/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { doctorId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(doctorId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const target = await prisma.doctor.findFirst({
    where: { id: doctorId, deletedAt: null },
    select: { clinicId: true, signatureUrl: true },
  });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isSelf = user.doctorId === doctorId;
  const isSameClinicAdmin = user.clinicId === target.clinicId && hasPermission(user, "admin.view");
  if (user.role !== "super_admin" && !isSelf && !isSameClinicAdmin) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!target.signatureUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readUploadFile(target.signatureUrl);
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
