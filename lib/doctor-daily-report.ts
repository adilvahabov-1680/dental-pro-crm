/**
 * Doctor Daily Report v1 — Session 70. Read-only. No mutations, no finance/
 * inventory write-off logic touched. clinicId всегда из сессии.
 *
 * Scope правило (как на /treatments — user.role !== "doctor" && !== "assistant"
 * решает видимость фильтра по врачу, см. app/(dashboard)/treatments/page.tsx):
 *  - doctor — только свои (doctorId форсируется, query-параметр игнорируется);
 *  - assistant — только прикреплённый врач (assignedDoctorId), без query;
 *  - owner/admin — вся клиника по умолчанию + фильтр по врачу.
 * "Сделано сегодня" = TreatmentItem.status=done, performedAt в выбранный день.
 *
 * Финансовые цифры:
 *  - revenue = Σ(price-discount) самих TreatmentItem (не Invoice/Payment) —
 *    однозначно привязано к врачу/дате, существующая модель это поддерживает.
 *  - Payment НЕ имеет doctorId/treatmentItemId в схеме — нельзя корректно
 *    атрибутировать конкретному врачу. Показываем сумму платежей клиники за
 *    день ТОЛЬКО в режиме "вся клиника" (без фильтра по врачу) — без
 *    pro-rata разбивки (finance-логику не меняем).
 *  - profit = revenue − consumablesCost (обе части доктор/дата-scoped
 *    корректно) — оценочная, не равна кэш-прибыли клиники.
 *  - себестоимость расходников — реюз lib/consumable-cost-reports.ts
 *    (тот же источник истины, что и /reports/consumables): baseQuantity
 *    из TreatmentConsumableUsage — это ФАКТ применения (учитывает override
 *    и reversal через wasSkipped/isReversed), а не шаблонное значение.
 */
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";
import {
  getConsumableCostSummary,
  getConsumableCostByInventoryItem,
  type CostByInventoryItem,
} from "@/lib/consumable-cost-reports";

export interface DoctorDailyFilters {
  dateFrom: Date;
  dateTo: Date;
  doctorId?: string;
}

export interface DoctorDailyPermissions {
  canViewFinance: boolean;
  canViewConsumables: boolean;
}

export interface DoctorDailySummary {
  patientsCount: number;
  treatmentsCount: number;
  revenueGapik: number;
  consumablesCostGapik: number;
  profitGapik: number | null;
  paymentsGapik: number | null;
}

export interface DoctorDailyTreatmentRow {
  id: string;
  patientId: string;
  patientName: string;
  doctorName: string;
  performedAt: Date;
  serviceName: string;
  priceGapik: number;
  discountGapik: number;
  chargedGapik: number;
  invoice: { status: string; totalGapik: number; paidGapik: number } | null;
  consumablesCostGapik: number;
  consumables: Array<{ itemName: string; baseQuantity: number; baseUnit: string }>;
}

function buildTreatmentWhere(clinicId: string, f: DoctorDailyFilters) {
  return {
    clinicId,
    deletedAt: null,
    status: "done" as const,
    performedAt: { gte: f.dateFrom, lte: f.dateTo },
    ...(f.doctorId ? { doctorId: f.doctorId } : {}),
  };
}

/** Сводка для карточек заголовка отчёта. */
export async function getDoctorDailySummary(
  user: SessionUser,
  filters: DoctorDailyFilters,
  perms: DoctorDailyPermissions,
): Promise<DoctorDailySummary> {
  if (!user.clinicId) {
    return {
      patientsCount: 0,
      treatmentsCount: 0,
      revenueGapik: 0,
      consumablesCostGapik: 0,
      profitGapik: null,
      paymentsGapik: null,
    };
  }
  const db = tenantClient(user.clinicId);
  const items = await db.treatmentItem.findMany({
    where: buildTreatmentWhere(user.clinicId, filters),
    select: { patientId: true, price: true, discount: true },
  });

  const patientsCount = new Set(items.map((i) => i.patientId)).size;
  const revenueGapik = items.reduce((sum, i) => sum + (i.price - i.discount), 0);

  const consumablesCostGapik = perms.canViewConsumables
    ? (
        await getConsumableCostSummary(user, {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          doctorId: filters.doctorId,
        })
      ).totalCostGapik
    : 0;

  let paymentsGapik: number | null = null;
  if (perms.canViewFinance && !filters.doctorId) {
    const agg = await db.payment.aggregate({
      where: { clinicId: user.clinicId, paidAt: { gte: filters.dateFrom, lte: filters.dateTo } },
      _sum: { amount: true },
    });
    paymentsGapik = agg._sum.amount ?? 0;
  }

  const profitGapik =
    perms.canViewFinance && perms.canViewConsumables ? revenueGapik - consumablesCostGapik : null;

  return { patientsCount, treatmentsCount: items.length, revenueGapik, consumablesCostGapik, profitGapik, paymentsGapik };
}

/** Список процедур за день (пациент/время/услуга/сумма/расходники). */
export async function getDoctorDailyTreatments(
  user: SessionUser,
  filters: DoctorDailyFilters,
  perms: DoctorDailyPermissions,
): Promise<DoctorDailyTreatmentRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const items = await db.treatmentItem.findMany({
    where: buildTreatmentWhere(user.clinicId, filters),
    select: {
      id: true,
      patientId: true,
      price: true,
      discount: true,
      performedAt: true,
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
      service: { select: { name: true } },
      invoice: { select: { status: true, total: true, paidAmount: true } },
      consumableUsages: {
        where: { wasSkipped: false, isReversed: false },
        select: {
          baseQuantity: true,
          baseUnit: true,
          inventoryItem: { select: { name: true, unitCost: true } },
        },
      },
    },
    orderBy: { performedAt: "asc" },
  });

  return items.map((i) => {
    const usages = perms.canViewConsumables ? i.consumableUsages : [];
    const consumablesCostGapik = usages.reduce((sum, u) => {
      const uc = u.inventoryItem.unitCost;
      return uc !== null ? sum + Math.round(Number(u.baseQuantity) * uc) : sum;
    }, 0);
    return {
      id: i.id,
      patientId: i.patientId,
      patientName: `${i.patient.lastName} ${i.patient.firstName}`,
      doctorName: i.doctor.user.fullName,
      performedAt: i.performedAt!,
      serviceName: i.service.name,
      priceGapik: i.price,
      discountGapik: i.discount,
      chargedGapik: i.price - i.discount,
      invoice:
        perms.canViewFinance && i.invoice
          ? { status: i.invoice.status, totalGapik: i.invoice.total, paidGapik: i.invoice.paidAmount }
          : null,
      consumablesCostGapik,
      consumables: usages.map((u) => ({
        itemName: u.inventoryItem.name,
        baseQuantity: Number(u.baseQuantity),
        baseUnit: u.baseUnit,
      })),
    };
  });
}

/** Материалы/медикаменты, списанные за день (агрегат по позиции). Реюз lib/consumable-cost-reports.ts. */
export async function getDoctorDailyConsumables(
  user: SessionUser,
  filters: DoctorDailyFilters,
): Promise<CostByInventoryItem[]> {
  return getConsumableCostByInventoryItem(user, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    doctorId: filters.doctorId,
  });
}

/** "Сегодня" в часовом поясе сервера (см. известный TODO tz в других модулях). */
export function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
