/**
 * Данные модуля Müalicə (server-only).
 * Scope — по пациенту (как dental chart): врач видит лечение своих пациентов,
 * ассистент — пациентов прикреплённого врача, админ/владелец — клинику.
 * Treatment item ≠ tooth_history: процедура — медицинская запись,
 * история зуба — смена статусов зуба (не смешиваются).
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import type { SessionUser } from "@/types/auth";

/** Статусы, не входящие в активную сумму. */
export const INACTIVE_ITEM_STATUSES = ["cancelled"] as const;

const itemInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
  service: { select: { id: true, name: true } },
  treatmentPlan: { select: { id: true, title: true, status: true } },
  appointment: { select: { id: true, startsAt: true } },
  invoice: { select: { id: true, number: true } },
  materials: {
    include: { inventoryItem: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TreatmentItemInclude;

export type TreatmentItemFull = Prisma.TreatmentItemGetPayload<{ include: typeof itemInclude }>;

export interface TreatmentFilters {
  q?: string;
  doctorId?: string;
  status?: "planned" | "in_progress" | "done" | "cancelled";
  tooth?: number;
}

async function patientScoped(user: SessionUser): Promise<Prisma.TreatmentItemWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

export async function listTreatmentItems(
  user: SessionUser,
  filters: TreatmentFilters,
): Promise<TreatmentItemFull[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.TreatmentItemWhereInput[] = [{ deletedAt: null }, await patientScoped(user)];
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
  if (filters.doctorId) and.push({ doctorId: filters.doctorId });
  if (filters.status) and.push({ status: filters.status });
  if (filters.tooth) and.push({ toothNumber: filters.tooth });

  return (await db.treatmentItem.findMany({
    where: { AND: and },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as TreatmentItemFull[];
}

/** Item в scope пользователя; чужой → null. */
export async function getTreatmentItemForUser(
  user: SessionUser,
  id: string,
): Promise<TreatmentItemFull | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.treatmentItem.findFirst({
    where: { AND: [{ id, deletedAt: null }, await patientScoped(user)] },
    include: itemInclude,
  })) as TreatmentItemFull | null;
}

/** Блок «Müalicə» пациента: планы, последние процедуры, суммы. */
export async function listPatientTreatments(user: SessionUser, patientId: string) {
  if (!user.clinicId) {
    return { plans: [], items: [], total: 0, activeAmount: 0, doneAmount: 0 };
  }
  const db = tenantClient(user.clinicId);
  const [plans, items, total] = await Promise.all([
    db.treatmentPlan.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    }),
    db.treatmentItem.findMany({
      where: { patientId, deletedAt: null },
      include: itemInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.treatmentItem.count({ where: { patientId, deletedAt: null } }),
  ]);
  const active = (items as TreatmentItemFull[]).filter(
    (i) => !INACTIVE_ITEM_STATUSES.includes(i.status as "cancelled"),
  );
  const activeAmount = active.reduce((s, i) => s + i.price - i.discount, 0);
  const doneAmount = active
    .filter((i) => i.status === "done")
    .reduce((s, i) => s + i.price - i.discount, 0);
  return { plans, items: items as TreatmentItemFull[], total, activeAmount, doneAmount };
}

/** Услуги клиники с текущей ценой (validTo = null). */
export async function listServicesWithPrice(user: SessionUser) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const services = await db.service.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      prices: { where: { validTo: null }, take: 1, select: { price: true, childPrice: true } },
    },
    orderBy: { name: "asc" },
  });
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    /** qəpik; null = цены в прайсе нет → ручной ввод */
    price: s.prices[0]?.price ?? null,
  }));
}

/** Планы пациента для select'а (не отменённые). */
export async function listPatientPlans(user: SessionUser, patientId: string) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.treatmentPlan.findMany({
    where: { patientId, deletedAt: null, status: { not: "cancelled" } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Приёмы пациента для select'а (последние 20). */
export async function listPatientAppointmentOptions(user: SessionUser, patientId: string) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.appointment.findMany({
    where: { patientId, deletedAt: null },
    select: { id: true, startsAt: true, complaint: true },
    orderBy: { startsAt: "desc" },
    take: 20,
  });
}

/** Последние процедуры по зубу (для панели зуба, read-only). */
export async function lastToothTreatments(
  user: SessionUser,
  patientId: string,
  toothNumber: number,
) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.treatmentItem.findMany({
    where: { patientId, toothNumber, deletedAt: null },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
    take: 3,
  })) as TreatmentItemFull[];
}

/** Пересчёт totalPrice плана = Σ(price − discount) некэнселённых items. */
export async function recalcPlanTotal(
  db: ReturnType<typeof tenantClient>,
  planId: string,
): Promise<void> {
  const items = await db.treatmentItem.findMany({
    where: { treatmentPlanId: planId, deletedAt: null, status: { notIn: ["cancelled"] } },
    select: { price: true, discount: true },
  });
  const total = items.reduce((s, i) => s + i.price - i.discount, 0);
  await db.treatmentPlan.updateMany({ where: { id: planId }, data: { totalPrice: total } });
}
