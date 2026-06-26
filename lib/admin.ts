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
  avatarUrl: string | null;
  updatedAt: Date;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Doctor-профиль, если есть (сессия 86) — для подписи врача. */
  doctorId: string | null;
  signatureUrl: string | null;
  doctorUpdatedAt: Date | null;
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
    include: {
      role: true,
      doctorProfile: { select: { id: true, signatureUrl: true, updatedAt: true } },
    },
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
      avatarUrl: u.avatarUrl,
      updatedAt: u.updatedAt,
      doctorId: u.doctorProfile?.id ?? null,
      signatureUrl: u.doctorProfile?.signatureUrl ?? null,
      doctorUpdatedAt: u.doctorProfile?.updatedAt ?? null,
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

// ─── Doctor ↔ Assistant assignment helpers ───────────────────────────────────

export interface DoctorForAdmin {
  doctorId: string;
  doctorUserId: string;
  doctorName: string;
  linkedAssistants: Array<{ assistantUserId: string; fullName: string }>;
}

export interface DoctorTransferPreview {
  patientCount: number;
  upcomingAppointmentCount: number;
}

export interface AssistantUserForAdmin {
  userId: string;
  fullName: string;
  linkedDoctorUserId: string | null;
}

/** Активные врачи клиники с их ассистентами (для /admin страницы). */
export async function listDoctorsForAdmin(clinicId: string): Promise<DoctorForAdmin[]> {
  const doctors = await prisma.doctor.findMany({
    where: { clinicId, isActive: true, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true } },
      assistants: {
        where: { isActive: true, deletedAt: null },
        include: { user: { select: { id: true, fullName: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return doctors.map((d) => ({
    doctorId: d.id,
    doctorUserId: d.userId,
    doctorName: d.user.fullName,
    linkedAssistants: d.assistants.map((a) => ({
      assistantUserId: a.userId,
      fullName: a.user.fullName,
    })),
  }));
}

/**
 * Preview counts for doctor transfer: patients and upcoming active appointments.
 * fromDoctorId is Doctor.id (profile ID, not userId).
 */
export async function getDoctorTransferPreview(
  clinicId: string,
  fromDoctorId: string,
): Promise<DoctorTransferPreview> {
  const now = new Date();
  const [patientCount, upcomingAppointmentCount] = await Promise.all([
    prisma.patient.count({
      where: { clinicId, primaryDoctorId: fromDoctorId, deletedAt: null },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        doctorId: fromDoctorId,
        status: { in: ["scheduled", "notified", "confirmed", "reschedule_requested"] },
        startsAt: { gte: now },
        deletedAt: null,
      },
    }),
  ]);
  return { patientCount, upcomingAppointmentCount };
}

/** Активные ассистенты клиники с их текущей привязкой к врачу (по userId врача). */
export async function listAssistantUsersForAdmin(clinicId: string): Promise<AssistantUserForAdmin[]> {
  const assistants = await prisma.assistant.findMany({
    where: { clinicId, isActive: true, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true } },
      assignedDoctor: { select: { userId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return assistants.map((a) => ({
    userId: a.userId,
    fullName: a.user.fullName,
    linkedDoctorUserId: a.assignedDoctor?.userId ?? null,
  }));
}
