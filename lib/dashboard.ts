/**
 * Данные дашборда (server-only). Все цифры — реальные, в scope пользователя:
 * приёмы — appointmentScopeWhere, медицина/финансы — patientScopeWhere
 * (через соответствующие модули), склад — общеклиничный.
 * Permission-гейтинг выполняется здесь: блок без <module>.view = null,
 * UI просто не рендерит карточку/панель.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { appointmentScopeWhere, NON_BLOCKING_STATUSES } from "@/lib/appointments";
import { patientScopeWhere } from "@/lib/patients";
import { OPEN_DEBT_STATUSES } from "@/lib/finance";
import { inventoryStatus } from "@/lib/inventory";
import { unreadNotificationsCount } from "@/lib/notifications";
import type { SessionUser } from "@/types/auth";

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export interface DashboardSummary {
  /** null = нет permission на модуль → карточка скрывается */
  todayAppointments: { count: number; nextAt: Date | null } | null;
  doneTreatmentsMonth: { count: number; amount: number } | null;
  pendingPayments: { debt: number; invoices: number } | null;
  lowStock: { low: number; out: number } | null;
  newPatientsMonth: number | null;
  monthPayments: number | null;
  unreadNotifications: number | null;
}

export async function dashboardSummary(user: SessionUser): Promise<DashboardSummary> {
  const empty: DashboardSummary = {
    todayAppointments: null,
    doneTreatmentsMonth: null,
    pendingPayments: null,
    lowStock: null,
    newPatientsMonth: null,
    monthPayments: null,
    unreadNotifications: null,
  };
  if (!user.clinicId) return empty;
  const db = tenantClient(user.clinicId);
  const { from, to } = todayBounds();
  const since = monthStart();
  const now = new Date();

  const pScope = await patientScopeWhere(user);
  const patientFilter = Object.keys(pScope).length ? { patient: pScope } : {};
  const apptScope = appointmentScopeWhere(user);
  const activeToday: Prisma.AppointmentWhereInput = {
    deletedAt: null,
    startsAt: { gte: from, lt: to },
    status: { notIn: [...NON_BLOCKING_STATUSES] },
  };

  const [todayCount, nextAppt, doneAgg, debtAgg, items, newPatients, monthPay, unread] =
    await Promise.all([
      hasPermission(user, "appointments.view")
        ? db.appointment.count({ where: { AND: [activeToday, apptScope] } })
        : Promise.resolve(null),
      hasPermission(user, "appointments.view")
        ? db.appointment.findFirst({
            where: { AND: [activeToday, apptScope, { startsAt: { gte: now } }] },
            orderBy: { startsAt: "asc" },
            select: { startsAt: true },
          })
        : Promise.resolve(null),
      hasPermission(user, "treatments.view")
        ? db.treatmentItem.aggregate({
            where: {
              deletedAt: null,
              status: "done",
              performedAt: { gte: since },
              ...patientFilter,
            },
            _count: { _all: true },
            _sum: { price: true, discount: true },
          })
        : Promise.resolve(null),
      hasPermission(user, "finance.view")
        ? db.debt.aggregate({
            where: { status: { in: [...OPEN_DEBT_STATUSES] }, ...patientFilter },
            _count: { _all: true },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      hasPermission(user, "inventory.view")
        ? db.inventoryItem.findMany({
            where: { deletedAt: null, isActive: true },
            select: { quantity: true, minQuantity: true, expiresAt: true },
          })
        : Promise.resolve(null),
      hasPermission(user, "patients.view")
        ? db.patient.count({
            where: { AND: [pScope, { deletedAt: null, createdAt: { gte: since } }] },
          })
        : Promise.resolve(null),
      hasPermission(user, "finance.view")
        ? db.payment.aggregate({
            where: { paidAt: { gte: since }, ...patientFilter },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      unreadNotificationsCount(user),
    ]);

  let lowStock: DashboardSummary["lowStock"] = null;
  if (items) {
    let low = 0;
    let out = 0;
    for (const i of items) {
      const s = inventoryStatus(i);
      if (s === "low") low++;
      if (s === "out") out++;
    }
    lowStock = { low, out };
  }

  return {
    todayAppointments:
      todayCount === null ? null : { count: todayCount, nextAt: nextAppt?.startsAt ?? null },
    doneTreatmentsMonth: doneAgg
      ? {
          count: doneAgg._count._all,
          amount: (doneAgg._sum.price ?? 0) - (doneAgg._sum.discount ?? 0),
        }
      : null,
    pendingPayments: debtAgg
      ? { debt: debtAgg._sum.amount ?? 0, invoices: debtAgg._count._all }
      : null,
    lowStock,
    newPatientsMonth: newPatients,
    monthPayments: monthPay ? (monthPay._sum.amount ?? 0) : null,
    unreadNotifications: hasPermission(user, "notifications.view") ? unread : null,
  };
}

const dashboardApptInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.AppointmentInclude;

export type DashboardAppointment = Prisma.AppointmentGetPayload<{
  include: typeof dashboardApptInclude;
}>;

/** Приёмы сегодняшнего дня в scope (для панели, по времени). */
export async function listTodayAppointments(user: SessionUser): Promise<DashboardAppointment[]> {
  if (!user.clinicId || !hasPermission(user, "appointments.view")) return [];
  const db = tenantClient(user.clinicId);
  const { from, to } = todayBounds();
  return (await db.appointment.findMany({
    where: {
      AND: [{ deletedAt: null, startsAt: { gte: from, lt: to } }, appointmentScopeWhere(user)],
    },
    include: dashboardApptInclude,
    orderBy: { startsAt: "asc" },
    take: 8,
  })) as DashboardAppointment[];
}

const openInvoiceInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  debt: { select: { amount: true, status: true } },
} satisfies Prisma.InvoiceInclude;

export type DashboardInvoice = Prisma.InvoiceGetPayload<{ include: typeof openInvoiceInclude }>;

/** Неоплаченные/частично оплаченные счета в scope (для панели). */
export async function listOpenInvoices(user: SessionUser): Promise<DashboardInvoice[]> {
  if (!user.clinicId || !hasPermission(user, "finance.view")) return [];
  const db = tenantClient(user.clinicId);
  const pScope = await patientScopeWhere(user);
  const patientFilter = Object.keys(pScope).length ? { patient: pScope } : {};
  return (await db.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ["issued", "partially_paid"] },
      ...patientFilter,
    },
    include: openInvoiceInclude,
    orderBy: { createdAt: "desc" },
    take: 6,
  })) as DashboardInvoice[];
}

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  userName: string;
  createdAt: Date;
}

/**
 * Последние действия из audit_log — только для общеклиничных ролей
 * (owner/admin/reception/accountant): лог не фильтруется по пациентскому
 * scope, врачу/ассистенту показывать его нельзя.
 */
export async function listRecentActivity(user: SessionUser): Promise<ActivityRow[]> {
  if (!user.clinicId) return [];
  if (user.role === "doctor" || user.role === "assistant" || user.role === "super_admin") return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, action: true, entityType: true, userId: true, createdAt: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] }, clinicId: user.clinicId },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    userName: names.get(r.userId) ?? "—",
    createdAt: r.createdAt,
  }));
}
