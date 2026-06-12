import { z } from "zod";

/** Типы PDF, доступные для генерации в v1. */
export const GENERATABLE_PDF_TYPES = ["extract", "invoice_pdf"] as const;

export const treatmentSummarySchema = z.object({
  patientId: z.string().uuid("patientNotFound"),
});

export const invoicePdfSchema = z.object({
  invoiceId: z.string().uuid("invoiceNotFound"),
});

export interface DocumentFormState {
  error?: string;
  /** успешная загрузка файла (форма остаётся на странице) */
  uploadedId?: string;
  /** успешное (или идемпотентно-повторное) удаление */
  deleted?: boolean;
}

export const deleteDocumentSchema = z.object({
  documentId: z.string().uuid("notFound"),
});

// ───────────────── Загрузка файлов пациента (сессия 14) ─────────────────

/** Категории загружаемых файлов = существующий enum DocumentType. */
export const UPLOAD_DOCUMENT_TYPES = ["xray", "consent", "photo", "contract", "other"] as const;

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Разрешённые mime → расширение серверного имени файла (v1: PDF + изображения). */
export const UPLOAD_MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const uploadDocumentSchema = z.object({
  patientId: z.string().uuid("patientNotFound"),
  type: z.enum(UPLOAD_DOCUMENT_TYPES),
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

/**
 * Определение mime по магическим байтам — клиентскому mime/имени не доверяем.
 * null = тип не входит в whitelist (отклонить).
 */
export function sniffUploadMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Оригинальное имя файла → безопасный заголовок документа:
 * убираются пути/управляющие символы; пустое → fallback.
 */
export function sanitizeOriginalName(raw: string, fallback: string): string {
  const name = raw
    .split(/[\\/]/)
    .pop()!
    // p{Cc} = upravlyayushchie simvoly; plyus simvoly, zapreshchyonnye v imenah fajlov
    .replace(/[<>:"|?*\p{Cc}]/gu, "")
    .trim()
    .slice(0, 200);
  return name || fallback;
}
