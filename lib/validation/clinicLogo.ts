import { UPLOAD_MIME_EXT } from "@/lib/validation/documents";

/**
 * Лого клиники (сессия 81): отдельный whitelist от общих документов —
 * только изображения (PDF из UPLOAD_MIME_EXT сюда не входит), отдельный
 * (меньший) лимит размера. Магические байты — тот же sniffUploadMime,
 * что и у документов пациента (единая точка валидации содержимого).
 */
export const CLINIC_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const CLINIC_LOGO_MIME_EXT: Record<string, string> = {
  "image/jpeg": UPLOAD_MIME_EXT["image/jpeg"],
  "image/png": UPLOAD_MIME_EXT["image/png"],
  "image/webp": UPLOAD_MIME_EXT["image/webp"],
};

export interface ClinicLogoFormState {
  error?: string;
  saved?: boolean;
}
