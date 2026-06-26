/**
 * Безопасное резолвление подписи врача для встраивания в PDF (сессия 87).
 * Только чтение готовых данных — рендер остаётся в lib/pdf.ts, запись/БД —
 * в lib/actions/documents.ts (та же разделённость, что и у остального PDF-кода).
 *
 * Безопасность:
 *  - tenant-проверка: подпись резолвится только при совпадении Doctor.clinicId
 *    с clinicId документа — врач из другой клиники не может быть встроен
 *    (даже если primaryDoctorId на пациенте оказался бы рассинхронизирован).
 *  - путь к файлу — ТОЛЬКО из БД (doctor.signatureUrl), читается через
 *    readUploadFile (resolveUploadPath отсекает path traversal) — raw-путь
 *    никогда не передаётся в PDF.
 *  - mime пересниффается по факту (sniffUploadMime), сохранённому
 *    расширению/типу не доверяем.
 *  - pdfkit поддерживает только PNG и JPEG (см. node_modules/pdfkit —
 *    классы JPEG/PNGImage, отдельного декодера WebP нет) — WebP-подписи
 *    (валидно загружаемые в Session 86) здесь корректно пропускаются:
 *    документ рендерится без подписи, без ошибки.
 *  - любая ошибка (нет файла, нет подписи, неизвестный формат) → null,
 *    вызывающий код просто не добавляет секцию подписи.
 */
import { prisma } from "@/lib/prisma";
import { readUploadFile } from "@/lib/storage";
import { sniffUploadMime } from "@/lib/validation/documents";

export interface PdfSignatureImage {
  buffer: Buffer;
  mime: "image/png" | "image/jpeg";
}

export async function resolveDoctorSignatureForPdf(
  doctorId: string | null | undefined,
  clinicId: string,
): Promise<PdfSignatureImage | null> {
  if (!doctorId) return null;
  try {
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, clinicId, deletedAt: null },
      select: { signatureUrl: true },
    });
    if (!doctor?.signatureUrl) return null;

    const file = await readUploadFile(doctor.signatureUrl);
    if (!file) return null;

    const mime = sniffUploadMime(file);
    if (mime !== "image/png" && mime !== "image/jpeg") return null;

    return { buffer: file, mime };
  } catch (e) {
    console.error("resolveDoctorSignatureForPdf failed:", e);
    return null;
  }
}
