/**
 * Данные модуля Qəbullar (server-only).
 * Scope (DATABASE.md §3): doctor — свои приёмы (doctorId), assistant — приёмы
 * прикреплённого врача, owner/admin/reception/accountant — вся клиника.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

/** Статусы, не блокирующие время врача (отменённые/несостоявшиеся). */
export const NON_BLOCKING_STATUSES = ["cancelled", "late_cancelled", "no_show"] as const;

export function appointmentScopeWhere(user: SessionUser): Prisma.AppointmentWhereInput {
  if (user.role === "doctor") {
    return user.doctorId ? { doctorId: user.doctorId } : { id: "00000000-0000-0000-0000-000000000000" };
  }
  if (user.role === "assistant") {
    return user.assignedDoctorId
      ? { doctorId: user.assignedDoctorId }
      : { id: "00000000-0000-0000-0000-000000000000" };
  }
  return {};
}

const listInclude = {
  patient: {
    select: { id: true, firstName: true, lastName: true, phone: true, guardianId: true },
  },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentListItem = Prisma.AppointmentGetPayload<{ include: typeof listInclude }>;

export interface AppointmentFilters {
  /** yyyy-mm-dd; для view=day — день, для week — любой день недели */
  date?: string;
  doctorId?: string;
  q?: string;
  range?: "day" | "week" | "all";
}

export function dayBounds(dateStr: string): { from: Date; to: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const from = new Date(y, m - 1, d);
  const to = new Date(y, m - 1, d + 1);
  return { from, to };
}

/** Понедельник недели, содержащей дату. */
export function weekStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = (date.getDay() + 6) % 7; // 0=Mon
  date.setDate(date.getDate() - day);
  return date;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function listAppointments(
  user: SessionUser,
  filters: AppointmentFilters,
): Promise<AppointmentListItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.AppointmentWhereInput[] = [{ deletedAt: null }, appointmentScopeWhere(user)];

  const dateStr = filters.date ?? toDateStr(new Date());
  if (filters.range === "day") {
    const { from, to } = dayBounds(dateStr);
    and.push({ startsAt: { gte: from, lt: to } });
  } else if (filters.range === "week") {
    const from = weekStart(dateStr);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    and.push({ startsAt: { gte: from, lt: to } });
  }
  if (filters.doctorId) and.push({ doctorId: filters.doctorId });
  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      patient: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
    });
  }

  return (await db.appointment.findMany({
    where: { AND: and },
    include: listInclude,
    orderBy: { startsAt: filters.range === "all" ? "desc" : "asc" },
    take: filters.range === "all" ? 50 : 200,
  })) as AppointmentListItem[];
}

/** Приём по id в scope пользователя (tenant + роль); чужой → null. */
export async function getAppointmentForUser(
  user: SessionUser,
  id: string,
): Promise<AppointmentListItem | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.appointment.findFirst({
    where: { AND: [{ id, deletedAt: null }, appointmentScopeWhere(user)] },
    include: listInclude,
  })) as AppointmentListItem | null;
}

/** Блок «Qəbullar» на карточке пациента: ближайший + последние 3. */
export async function listPatientAppointments(user: SessionUser, patientId: string) {
  if (!user.clinicId) return { upcoming: null, recent: [] as AppointmentListItem[], total: 0 };
  const db = tenantClient(user.clinicId);
  const scope = appointmentScopeWhere(user);
  const now = new Date();
  const [upcoming, recent, total] = await Promise.all([
    db.appointment.findFirst({
      where: {
        AND: [
          { patientId, deletedAt: null, startsAt: { gte: now } },
          { status: { notIn: [...NON_BLOCKING_STATUSES] } },
          scope,
        ],
      },
      include: listInclude,
      orderBy: { startsAt: "asc" },
    }),
    db.appointment.findMany({
      where: { AND: [{ patientId, deletedAt: null, startsAt: { lt: now } }, scope] },
      include: listInclude,
      orderBy: { startsAt: "desc" },
      take: 3,
    }),
    db.appointment.count({ where: { AND: [{ patientId, deletedAt: null }, scope] } }),
  ]);
  return {
    upcoming: upcoming as AppointmentListItem | null,
    recent: recent as AppointmentListItem[],
    total,
  };
}

/** Пересечение по врачу (исключая отменённые/несостоявшиеся). */
export async function hasOverlap(
  clinicId: string,
  doctorId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const db = tenantClient(clinicId);
  const clash = await db.appointment.findFirst({
    where: {
      doctorId,
      deletedAt: null,
      status: { notIn: [...NON_BLOCKING_STATUSES] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  return clash !== null;
}
