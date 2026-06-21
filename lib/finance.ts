/**
 * Данные модуля Maliyyə (server-only).
 * Scope — по пациенту (как treatments): doctor/reception видят финансы своих
 * пациентов (view), создают счета/оплаты роли с finance.manage (owner/admin/accountant).
 * Debt в схеме — per-invoice кэш (unique invoiceId); долг пациента = Σ open/partial.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import { hasPermission } from "@/lib/permissions";
import type { SessionUser } from "@/types/auth";

export const OPEN_DEBT_STATUSES = ["open", "partial"] as const;

const invoiceListInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
  debt: { select: { amount: true, status: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceListItem = Prisma.InvoiceGetPayload<{ include: typeof invoiceListInclude }>;

const invoiceDetailInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
  items: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { paidAt: "desc" } },
  debt: true,
} satisfies Prisma.InvoiceInclude;

export type InvoiceDetail = Prisma.InvoiceGetPayload<{ include: typeof invoiceDetailInclude }>;

async function patientScoped(user: SessionUser): Promise<Prisma.InvoiceWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

export interface FinanceFilters {
  q?: string;
  status?: "issued" | "partially_paid" | "paid" | "cancelled";
  doctorId?: string;
}

export async function listInvoices(
  user: SessionUser,
  filters: FinanceFilters,
): Promise<InvoiceListItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.InvoiceWhereInput[] = [{ deletedAt: null }, await patientScoped(user)];
  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      patient: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (filters.status) and.push({ status: filters.status });
  if (filters.doctorId) and.push({ doctorId: filters.doctorId });
  return (await db.invoice.findMany({
    where: { AND: and },
    include: invoiceListInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as InvoiceListItem[];
}

/** Счёт в scope пользователя; чужой → null. */
export async function getInvoiceForUser(
  user: SessionUser,
  id: string,
): Promise<InvoiceDetail | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.invoice.findFirst({
    where: { AND: [{ id, deletedAt: null }, await patientScoped(user)] },
    include: invoiceDetailInclude,
  })) as InvoiceDetail | null;
}

const debtCandidateInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  invoice: {
    select: { id: true, number: true, status: true, total: true, paidAmount: true, dueDate: true },
  },
} satisfies Prisma.DebtInclude;

export type DebtReminderCandidate = Prisma.DebtGetPayload<{ include: typeof debtCandidateInclude }>;

/**
 * Очередь debt reminder (сессия 47): открытые/частичные долги в scope
 * пользователя (по пациенту, как остальные finance-запросы), сортировка —
 * самый большой остаток первым, при равенстве — старые долги впереди.
 */
export async function listDebtReminderCandidates(
  user: SessionUser,
): Promise<DebtReminderCandidate[]> {
  if (!user.clinicId || !hasPermission(user, "finance.view")) return [];
  const db = tenantClient(user.clinicId);
  const pScope = await patientScopeWhere(user);
  const patientFilter = Object.keys(pScope).length ? { patient: pScope } : {};
  return (await db.debt.findMany({
    where: { status: { in: [...OPEN_DEBT_STATUSES] }, ...patientFilter },
    include: debtCandidateInclude,
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    take: 100,
  })) as DebtReminderCandidate[];
}

/** Summary-карточки /finance (в scope пользователя). */
export async function financeSummary(user: SessionUser) {
  if (!user.clinicId) return { invoiced: 0, paid: 0, debt: 0, monthPayments: 0 };
  const db = tenantClient(user.clinicId);
  const pScope = await patientScopeWhere(user);
  const patientFilter = Object.keys(pScope).length ? { patient: pScope } : {};
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [inv, debts, month] = await Promise.all([
    db.invoice.aggregate({
      where: { deletedAt: null, status: { not: "cancelled" }, ...patientFilter },
      _sum: { total: true, paidAmount: true },
    }),
    db.debt.aggregate({
      where: { status: { in: [...OPEN_DEBT_STATUSES] }, ...patientFilter },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { paidAt: { gte: monthStart }, ...patientFilter },
      _sum: { amount: true },
    }),
  ]);
  return {
    invoiced: inv._sum.total ?? 0,
    paid: inv._sum.paidAmount ?? 0,
    debt: debts._sum.amount ?? 0,
    monthPayments: month._sum.amount ?? 0,
  };
}

/** Финансы пациента: счета, оплаты, итоги. */
export async function listPatientFinance(user: SessionUser, patientId: string) {
  if (!user.clinicId) {
    return {
      invoices: [] as InvoiceListItem[],
      payments: [],
      invoiced: 0,
      paid: 0,
      debt: 0,
      lastReminderAt: null as Date | null,
    };
  }
  const db = tenantClient(user.clinicId);
  const [invoices, payments, inv, debts] = await Promise.all([
    db.invoice.findMany({
      where: { patientId, deletedAt: null },
      include: invoiceListInclude,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.payment.findMany({
      where: { patientId },
      orderBy: { paidAt: "desc" },
      take: 20,
      include: { invoice: { select: { id: true, number: true } } },
    }),
    db.invoice.aggregate({
      where: { patientId, deletedAt: null, status: { not: "cancelled" } },
      _sum: { total: true, paidAmount: true },
    }),
    db.debt.aggregate({
      where: { patientId, status: { in: [...OPEN_DEBT_STATUSES] } },
      _sum: { amount: true },
      _max: { lastReminderAt: true },
    }),
  ]);
  return {
    invoices: invoices as InvoiceListItem[],
    payments,
    invoiced: inv._sum.total ?? 0,
    paid: inv._sum.paidAmount ?? 0,
    debt: debts._sum.amount ?? 0,
    lastReminderAt: debts._max.lastReminderAt ?? null,
  };
}

const billableInclude = {
  service: { select: { name: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.TreatmentItemInclude;

export type BillableItem = Prisma.TreatmentItemGetPayload<{ include: typeof billableInclude }>;

/** Процедуры пациента, доступные для счёта: done, без invoice, не удалены. */
export async function listBillableItems(
  user: SessionUser,
  patientId: string,
): Promise<BillableItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.treatmentItem.findMany({
    where: { patientId, status: "done", invoiceId: null, deletedAt: null },
    include: billableInclude,
    orderBy: { performedAt: "desc" },
  })) as BillableItem[];
}

export type PaymentWithInvoice = Prisma.PaymentGetPayload<{
  include: { invoice: { select: { id: true; number: true } } };
}>;

/** Имена принявших оплату (receivedById → fullName). */
export async function paymentReceiverNames(
  user: SessionUser,
  userIds: string[],
): Promise<Map<string, string>> {
  if (!user.clinicId || userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, clinicId: user.clinicId },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
}
