"use server";

/**
 * Server actions личного профиля пользователя (сессия 83).
 * В отличие от lib/actions/settings.ts (требует settings.manage) — здесь
 * действие доступно ЛЮБОМУ авторизованному пользователю клиники: аватар —
 * личная настройка, не зависит от прав на управление настройками клиники.
 * user.id — только из сессии (requireAuth), клиентскому id не доверяем.
 * mime — по магическим байтам (sniffUploadMime), PDF/SVG отклоняются.
 * Старый файл на диске не удаляется (см. lib/actions/settings.ts —
 * тот же v1-паттерн, что у лого клиники и документов пациента).
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { saveUploadFile } from "@/lib/storage";
import { sniffUploadMime } from "@/lib/validation/documents";
import {
  USER_AVATAR_MAX_BYTES,
  USER_AVATAR_MIME_EXT,
  type UserAvatarFormState,
} from "@/lib/validation/userAvatar";

export async function uploadOwnAvatar(
  _prev: UserAvatarFormState | undefined,
  formData: FormData,
): Promise<UserAvatarFormState> {
  const user = await requireAuth();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "fileRequired" };
  if (file.size > USER_AVATAR_MAX_BYTES) return { error: "fileTooLarge" };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > USER_AVATAR_MAX_BYTES) return { error: "fileTooLarge" };

    const mime = sniffUploadMime(bytes);
    if (!mime || !USER_AVATAR_MIME_EXT[mime]) return { error: "unsupportedType" };

    const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    if (!existing) return { error: "generic" };

    // platform-пользователь (super_admin, clinicId=null) — отдельный безопасный путь
    const scope = user.clinicId ?? "platform";
    const fileName = `avatar-${Date.now()}-${randomBytes(4).toString("hex")}.${USER_AVATAR_MIME_EXT[mime]}`;
    const fileUrl = `user-avatars/${scope}/${user.id}/${fileName}`;
    await saveUploadFile(fileUrl, bytes);

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: fileUrl } });
    await prisma.auditLog.create({
      data: {
        clinicId: user.clinicId,
        userId: user.id,
        action: "update",
        entityType: "user",
        entityId: user.id,
        before: { avatarUrl: existing.avatarUrl },
        after: { avatarUrl: fileUrl },
      },
    });
  } catch (e) {
    console.error("uploadOwnAvatar failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  return { saved: true };
}
