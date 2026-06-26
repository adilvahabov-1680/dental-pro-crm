/**
 * Запросы личного профиля пользователя (сессия 83, server-only, не "use server").
 * Аватар читается точечно по id текущей сессии — без tenant-фильтра,
 * т.к. это всегда "сам себе" (id уже из сессии, см. lib/actions/profile.ts).
 */
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/types/auth";

export async function getOwnAvatar(user: SessionUser) {
  return prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarUrl: true, updatedAt: true },
  });
}

/** Подпись врача (сессия 86) — только если у пользователя есть Doctor-профиль. */
export async function getOwnDoctorSignature(doctorId: string) {
  return prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { signatureUrl: true, updatedAt: true },
  });
}
