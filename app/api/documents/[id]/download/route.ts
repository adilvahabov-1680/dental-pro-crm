/**
 * Отдача PDF-файла. Доступ проверяется здесь же (а не только на странице):
 * сессия → documents.view → tenant/scope через getDocumentForUser.
 * Путь к файлу берётся ТОЛЬКО из pdf_records (никакого user input),
 * resolveUploadPath дополнительно отсекает path traversal.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDocumentForUser } from "@/lib/documents";
import { readUploadFile } from "@/lib/storage";

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

  // чужой документ (другой tenant или вне scope) → 404 без утечки
  const record = await getDocumentForUser(user, id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readUploadFile(record.fileUrl);
  if (!file) return NextResponse.json({ error: "file_missing" }, { status: 404 });

  const filename = record.fileUrl.split("/").pop() ?? "document.pdf";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
