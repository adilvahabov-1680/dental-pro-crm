import { UPLOAD_MIME_EXT } from "@/lib/validation/documents";

/**
 * Подпись врача (сессия 86): тот же подход, что у лого клиники и аватара
 * пользователя — только изображения, PDF/SVG исключены, магические байты
 * через общий sniffUploadMime. Фундамент без интеграции в PDF/документы —
 * см. lib/pdf.ts (не трогается в этой сессии).
 */
export const DOCTOR_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const DOCTOR_SIGNATURE_MIME_EXT: Record<string, string> = {
  "image/jpeg": UPLOAD_MIME_EXT["image/jpeg"],
  "image/png": UPLOAD_MIME_EXT["image/png"],
  "image/webp": UPLOAD_MIME_EXT["image/webp"],
};

export interface DoctorSignatureFormState {
  error?: string;
  saved?: boolean;
}
