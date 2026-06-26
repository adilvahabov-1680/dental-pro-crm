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
import {
  DOCTOR_SIGNATURE_MAX_BYTES,
  DOCTOR_SIGNATURE_MIME_EXT,
  type DoctorSignatureFormState,
} from "@/lib/validation/doctorSignature";

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

/**
 * Загрузка подписи врачом для собственного Doctor-профиля (сессия 86).
 * doctorId — ТОЛЬКО из сессии (user.doctorId, заполняется при логине из
 * doctorProfile.id) — клиентскому doctorId не доверяем. Пользователь без
 * Doctor-профиля (owner/admin/reception/assistant/accountant без привязки)
 * получает ошибку — форма на /settings им вообще не показывается.
 */
export async function uploadOwnDoctorSignature(
  _prev: DoctorSignatureFormState | undefined,
  formData: FormData,
): Promise<DoctorSignatureFormState> {
  const user = await requireAuth();
  if (!user.doctorId) return { error: "notDoctor" };

  const file = formData.get("signature");
  if (!(file instanceof File) || file.size === 0) return { error: "fileRequired" };
  if (file.size > DOCTOR_SIGNATURE_MAX_BYTES) return { error: "fileTooLarge" };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > DOCTOR_SIGNATURE_MAX_BYTES) return { error: "fileTooLarge" };

    const mime = sniffUploadMime(bytes);
    if (!mime || !DOCTOR_SIGNATURE_MIME_EXT[mime]) return { error: "unsupportedType" };

    const existing = await prisma.doctor.findUnique({
      where: { id: user.doctorId },
      select: { clinicId: true, signatureUrl: true },
    });
    if (!existing) return { error: "notDoctor" };

    const fileName = `signature-${Date.now()}-${randomBytes(4).toString("hex")}.${DOCTOR_SIGNATURE_MIME_EXT[mime]}`;
    const fileUrl = `doctor-signatures/${existing.clinicId}/${user.doctorId}/${fileName}`;
    await saveUploadFile(fileUrl, bytes);

    await prisma.doctor.update({ where: { id: user.doctorId }, data: { signatureUrl: fileUrl } });
    await prisma.auditLog.create({
      data: {
        clinicId: user.clinicId,
        userId: user.id,
        action: "update",
        entityType: "doctor",
        entityId: user.doctorId,
        before: { signatureUrl: existing.signatureUrl },
        after: { signatureUrl: fileUrl },
      },
    });
  } catch (e) {
    console.error("uploadOwnDoctorSignature failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  return { saved: true };
}
