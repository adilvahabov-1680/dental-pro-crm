import { UPLOAD_MIME_EXT } from "@/lib/validation/documents";

/**
 * Аватар пользователя (сессия 83): тот же подход, что у лого клиники
 * (lib/validation/clinicLogo.ts) — только изображения, PDF/SVG исключены,
 * магические байты через общий sniffUploadMime.
 */
export const USER_AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const USER_AVATAR_MIME_EXT: Record<string, string> = {
  "image/jpeg": UPLOAD_MIME_EXT["image/jpeg"],
  "image/png": UPLOAD_MIME_EXT["image/png"],
  "image/webp": UPLOAD_MIME_EXT["image/webp"],
};

export interface UserAvatarFormState {
  error?: string;
  saved?: boolean;
}
