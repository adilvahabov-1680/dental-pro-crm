/**
 * Отдача файла документа. Доступ проверяется здесь же (а не только на странице):
 * сессия → documents.view → tenant/scope через getDocumentForUser /
 * getUploadedDocumentForUser. id ищется сначала в pdf_records (сгенерированные
 * PDF, поведение v1 не изменилось), затем в documents (загруженные файлы).
 * Путь к файлу берётся ТОЛЬКО из БД (никакого user input),
 * resolveUploadPath дополнительно отсекает path traversal.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDocumentForUser, getUploadedDocumentForUser } from "@/lib/documents";
import { readUploadFile } from "@/lib/storage";

/** mime, отображаемые в браузере; прочее отдаётся как attachment. */
const INLINE_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "documents.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 1) сгенерированный PDF (pdf_records) — контракт v1 без изменений
  const pdfRecord = await getDocumentForUser(user, id);
  if (pdfRecord) {
    const file = await readUploadFile(pdfRecord.fileUrl);
    if (!file) return NextResponse.json({ error: "file_missing" }, { status: 404 });
    const filename = pdfRecord.fileUrl.split("/").pop() ?? "document.pdf";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // 2) загруженный файл пациента (documents); чужой/вне scope → 404 без утечки
  const uploaded = await getUploadedDocumentForUser(user, id);
  if (!uploaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readUploadFile(uploaded.fileUrl);
  if (!file) return NextResponse.json({ error: "file_missing" }, { status: 404 });

  // имя в заголовке — серверное (ASCII), без оригинального имени клиента
  const filename = uploaded.fileUrl.split("/").pop() ?? "document";
  const disposition = INLINE_MIME.has(uploaded.mimeType) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": uploaded.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "private, no-store",
    },
  });
}
