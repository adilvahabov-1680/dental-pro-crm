/**
 * Admin v1 — управление кадрами клиники (owner/admin, admin.view/admin.manage).
 * Только clinicId текущего пользователя; super_admin сюда не попадает
 * (см. /admin redirect для !user.clinicId).
 */
import { prisma } from "@/lib/prisma";
import type { RoleKey } from "@/types/auth";

export interface StaffRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleKey: RoleKey;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** Роли, назначаемые через Admin v1 (без super_admin — платформенная роль). */
export const ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "doctor",
  "reception",
  "assistant",
  "accountant",
] as const;

/** Роли с доступом к Admin (admin.manage по дефолту) — защита от самоблокировки. */
export const ADMIN_ROLES: RoleKey[] = ["owner", "admin"];

export async function listStaff(clinicId: string): Promise<StaffRow[]> {
  const users = await prisma.user.findMany({
    where: { clinicId, deletedAt: null },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return users
    .filter((u) => u.role.key !== "super_admin")
    .map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      roleKey: u.role.key as RoleKey,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
}

/** Системные роли (clinicId: null), доступные для назначения. id нужен для User.roleId. */
export async function listAssignableRoles(): Promise<Array<{ id: string; key: RoleKey }>> {
  const roles = await prisma.role.findMany({
    where: { clinicId: null, key: { in: [...ASSIGNABLE_ROLES] } },
  });
  return roles.map((r) => ({ id: r.id, key: r.key as RoleKey }));
}

/** Кол-во активных owner/admin в клинике (опционально без одного пользователя). */
export async function countActiveAdmins(clinicId: string, excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      clinicId,
      isActive: true,
      deletedAt: null,
      role: { key: { in: ADMIN_ROLES } },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}
