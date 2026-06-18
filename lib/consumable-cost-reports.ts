/**
 * Consumable cost reports — Session 35.
 * Read-only. No mutations. clinicId always from session.
 *
 * Cost rule: baseQuantity × InventoryItem.unitCost (gapiks).
 * null unitCost → cost treated as 0; callers show "Qiymət yoxdur" marker.
 * v1 uses CURRENT InventoryItem.unitCost — historical snapshot is future work.
 */
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

export interface ConsumableCostFilters {
  dateFrom?: Date;
  dateTo?: Date;
  doctorId?: string;
  serviceId?: string;
  inventoryItemId?: string;
  patientId?: string;
}

export interface ConsumableCostSummary {
  totalCostGapik: number;
  totalUsageRows: number;
  totalTreatments: number;
  missingUnitCostCount: number;
}

export interface CostByInventoryItem {
  inventoryItemId: string;
  itemName: string;
  baseUnit: string;
  totalBaseQuantity: number;
  unitCostGapik: number | null;
  totalCostGapik: number;
  usageCount: number;
}

export interface CostByService {
  serviceId: string;
  serviceName: string;
  treatmentCount: number;
  totalCostGapik: number;
  avgCostGapik: number;
}

export interface CostByDoctor {
  doctorId: string;
  doctorName: string;
  treatmentCount: number;
  totalCostGapik: number;
  avgCostGapik: number;
}

export interface RecentUsageDetail {
  id: string;
  createdAt: Date;
  patientName: string;
  doctorName: string;
  serviceName: string;
  treatmentItemId: string;
  itemName: string;
  baseQuantity: number;
  baseUnit: string;
  unitCostGapik: number | null;
  lineCostGapik: number;
}

function buildWhere(clinicId: string, f: ConsumableCostFilters) {
  const tiFilter: { doctorId?: string; serviceId?: string; patientId?: string } = {};
  if (f.doctorId) tiFilter.doctorId = f.doctorId;
  if (f.serviceId) tiFilter.serviceId = f.serviceId;
  if (f.patientId) tiFilter.patientId = f.patientId;

  return {
    clinicId,
    wasSkipped: false,
    inventoryMovementId: { not: null as string | null },
    isReversed: false,
    ...(f.dateFrom || f.dateTo
      ? {
          createdAt: {
            ...(f.dateFrom ? { gte: f.dateFrom } : {}),
            ...(f.dateTo ? { lte: f.dateTo } : {}),
          },
        }
      : {}),
    ...(Object.keys(tiFilter).length > 0 ? { treatmentItem: tiFilter } : {}),
    ...(f.inventoryItemId ? { inventoryItemId: f.inventoryItemId } : {}),
  };
}

/** Summary counts and totals for the report header cards. */
export async function getConsumableCostSummary(
  user: SessionUser,
  filters: ConsumableCostFilters = {},
): Promise<ConsumableCostSummary> {
  if (!user.clinicId) {
    return { totalCostGapik: 0, totalUsageRows: 0, totalTreatments: 0, missingUnitCostCount: 0 };
  }
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: buildWhere(user.clinicId, filters),
    select: {
      treatmentItemId: true,
      baseQuantity: true,
      inventoryItem: { select: { unitCost: true } },
    },
  });
  let totalCostGapik = 0;
  let missingUnitCostCount = 0;
  const treatmentSet = new Set<string>();
  for (const r of rows) {
    treatmentSet.add(r.treatmentItemId);
    const uc = r.inventoryItem.unitCost;
    if (uc === null) {
      missingUnitCostCount++;
    } else {
      totalCostGapik += Math.round(Number(r.baseQuantity) * uc);
    }
  }
  return {
    totalCostGapik,
    totalUsageRows: rows.length,
    totalTreatments: treatmentSet.size,
    missingUnitCostCount,
  };
}

/** Aggregation by inventory item (material). Sorted by total cost descending. */
export async function getConsumableCostByInventoryItem(
  user: SessionUser,
  filters: ConsumableCostFilters = {},
): Promise<CostByInventoryItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: buildWhere(user.clinicId, filters),
    select: {
      inventoryItemId: true,
      baseQuantity: true,
      baseUnit: true,
      inventoryItem: { select: { name: true, unitCost: true } },
    },
  });
  const map = new Map<string, CostByInventoryItem>();
  for (const r of rows) {
    const uc = r.inventoryItem.unitCost;
    const lineCost = uc !== null ? Math.round(Number(r.baseQuantity) * uc) : 0;
    const existing = map.get(r.inventoryItemId);
    if (existing) {
      existing.totalBaseQuantity =
        Math.round((existing.totalBaseQuantity + Number(r.baseQuantity)) * 1000) / 1000;
      existing.totalCostGapik += lineCost;
      existing.usageCount++;
    } else {
      map.set(r.inventoryItemId, {
        inventoryItemId: r.inventoryItemId,
        itemName: r.inventoryItem.name,
        baseUnit: r.baseUnit,
        totalBaseQuantity: Number(r.baseQuantity),
        unitCostGapik: uc,
        totalCostGapik: lineCost,
        usageCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalCostGapik - a.totalCostGapik);
}

/** Aggregation by service. Sorted by total cost descending. */
export async function getConsumableCostByService(
  user: SessionUser,
  filters: ConsumableCostFilters = {},
): Promise<CostByService[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: buildWhere(user.clinicId, filters),
    select: {
      treatmentItemId: true,
      baseQuantity: true,
      inventoryItem: { select: { unitCost: true } },
      treatmentItem: {
        select: { serviceId: true, service: { select: { name: true } } },
      },
    },
  });
  const map = new Map<
    string,
    { serviceName: string; treatmentIds: Set<string>; totalCost: number }
  >();
  for (const r of rows) {
    const sid = r.treatmentItem.serviceId;
    const uc = r.inventoryItem.unitCost;
    const lineCost = uc !== null ? Math.round(Number(r.baseQuantity) * uc) : 0;
    const existing = map.get(sid);
    if (existing) {
      existing.treatmentIds.add(r.treatmentItemId);
      existing.totalCost += lineCost;
    } else {
      map.set(sid, {
        serviceName: r.treatmentItem.service.name,
        treatmentIds: new Set([r.treatmentItemId]),
        totalCost: lineCost,
      });
    }
  }
  return [...map.entries()]
    .map(([sid, v]) => ({
      serviceId: sid,
      serviceName: v.serviceName,
      treatmentCount: v.treatmentIds.size,
      totalCostGapik: v.totalCost,
      avgCostGapik:
        v.treatmentIds.size > 0 ? Math.round(v.totalCost / v.treatmentIds.size) : 0,
    }))
    .sort((a, b) => b.totalCostGapik - a.totalCostGapik);
}

/** Aggregation by doctor. Sorted by total cost descending. */
export async function getConsumableCostByDoctor(
  user: SessionUser,
  filters: ConsumableCostFilters = {},
): Promise<CostByDoctor[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: buildWhere(user.clinicId, filters),
    select: {
      treatmentItemId: true,
      baseQuantity: true,
      inventoryItem: { select: { unitCost: true } },
      treatmentItem: {
        select: {
          doctorId: true,
          doctor: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  });
  const map = new Map<
    string,
    { doctorName: string; treatmentIds: Set<string>; totalCost: number }
  >();
  for (const r of rows) {
    const did = r.treatmentItem.doctorId;
    const uc = r.inventoryItem.unitCost;
    const lineCost = uc !== null ? Math.round(Number(r.baseQuantity) * uc) : 0;
    const existing = map.get(did);
    if (existing) {
      existing.treatmentIds.add(r.treatmentItemId);
      existing.totalCost += lineCost;
    } else {
      map.set(did, {
        doctorName: r.treatmentItem.doctor.user.fullName,
        treatmentIds: new Set([r.treatmentItemId]),
        totalCost: lineCost,
      });
    }
  }
  return [...map.entries()]
    .map(([did, v]) => ({
      doctorId: did,
      doctorName: v.doctorName,
      treatmentCount: v.treatmentIds.size,
      totalCostGapik: v.totalCost,
      avgCostGapik:
        v.treatmentIds.size > 0 ? Math.round(v.totalCost / v.treatmentIds.size) : 0,
    }))
    .sort((a, b) => b.totalCostGapik - a.totalCostGapik);
}

/** Most recent usage rows with full detail (latest first). */
export async function getRecentConsumableUsages(
  user: SessionUser,
  filters: ConsumableCostFilters = {},
  limit = 50,
): Promise<RecentUsageDetail[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: buildWhere(user.clinicId, filters),
    select: {
      id: true,
      createdAt: true,
      baseQuantity: true,
      baseUnit: true,
      inventoryItem: { select: { name: true, unitCost: true } },
      treatmentItem: {
        select: {
          id: true,
          service: { select: { name: true } },
          doctor: { select: { user: { select: { fullName: true } } } },
          patient: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const uc = r.inventoryItem.unitCost;
    return {
      id: r.id,
      createdAt: r.createdAt,
      patientName: `${r.treatmentItem.patient.lastName} ${r.treatmentItem.patient.firstName}`,
      doctorName: r.treatmentItem.doctor.user.fullName,
      serviceName: r.treatmentItem.service.name,
      treatmentItemId: r.treatmentItem.id,
      itemName: r.inventoryItem.name,
      baseQuantity: Number(r.baseQuantity),
      baseUnit: r.baseUnit,
      unitCostGapik: uc,
      lineCostGapik: uc !== null ? Math.round(Number(r.baseQuantity) * uc) : 0,
    };
  });
}
