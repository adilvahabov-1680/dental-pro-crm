/**
 * Данные и helper для TreatmentConsumableUsage (Session 34–37).
 * Фактическое списание расходников по шаблонам ServiceConsumableTemplate.
 */
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

export interface TreatmentConsumableTemplate {
  templateId: string;
  inventoryItemId: string;
  itemName: string;
  itemUnit: string;
  doseToBaseFactor: number | null;
  currentStock: number;
  defaultQuantity: number;
  unit: string;
  allowOverride: boolean;
  isRequired: boolean;
  note: string | null;
}

export interface TreatmentConsumableUsageRow {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  wasSkipped: boolean;
  note: string | null;
  inventoryMovementId: string | null;
  createdAt: Date;
  createdByName: string | null;
  isReversed: boolean;
  reversedAt: Date | null;
  reversedById: string | null;
  reversedByName: string | null;
  reversalReason: string | null;
  reversalMovementId: string | null;
}

/** Consumable status for a treatment item based on its usage rows. */
export type ConsumableStatus = "none" | "applied" | "reversed" | "reapplied";

/** Шаблоны расходников для услуги (для формы checklist на странице лечения). */
export async function getConsumableTemplatesForService(
  user: SessionUser,
  serviceId: string,
): Promise<TreatmentConsumableTemplate[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.serviceConsumableTemplate.findMany({
    where: { serviceId },
    include: {
      inventoryItem: {
        select: { name: true, unit: true, doseToBaseFactor: true, quantity: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    templateId: r.id,
    inventoryItemId: r.inventoryItemId,
    itemName: r.inventoryItem.name,
    itemUnit: r.inventoryItem.unit,
    doseToBaseFactor: r.inventoryItem.doseToBaseFactor
      ? Number(r.inventoryItem.doseToBaseFactor)
      : null,
    currentStock: Number(r.inventoryItem.quantity),
    defaultQuantity: Number(r.quantity),
    unit: r.unit,
    allowOverride: r.allowOverride,
    isRequired: r.isRequired,
    note: r.note,
  }));
}

/** Уже применённые usage для treatmentItem, с именами пользователей для аудита. */
export async function getConsumableUsagesForTreatment(
  user: SessionUser,
  treatmentItemId: string,
): Promise<TreatmentConsumableUsageRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentConsumableUsage.findMany({
    where: { treatmentItemId },
    include: { inventoryItem: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Collect unique user IDs for a single display-name lookup
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.createdById) userIds.add(r.createdById);
    if (r.reversedById) userIds.add(r.reversedById);
  }
  const userNames = new Map<string, string>();
  if (userIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] }, clinicId: user.clinicId },
      select: { id: true, fullName: true },
    });
    for (const u of users) userNames.set(u.id, u.fullName);
  }

  return rows.map((r) => ({
    id: r.id,
    inventoryItemId: r.inventoryItemId,
    itemName: r.inventoryItem.name,
    quantity: Number(r.quantity),
    unit: r.unit,
    baseQuantity: Number(r.baseQuantity),
    baseUnit: r.baseUnit,
    wasSkipped: r.wasSkipped,
    note: r.note,
    inventoryMovementId: r.inventoryMovementId,
    createdAt: r.createdAt,
    createdByName: r.createdById ? (userNames.get(r.createdById) ?? null) : null,
    isReversed: r.isReversed,
    reversedAt: r.reversedAt,
    reversedById: r.reversedById,
    reversedByName: r.reversedById ? (userNames.get(r.reversedById) ?? null) : null,
    reversalReason: r.reversalReason,
    reversalMovementId: r.reversalMovementId,
  }));
}

/**
 * Bulk consumable status per treatment item — one query for all IDs.
 * Used by treatment list pages to show per-card status badges without N+1.
 */
export async function getConsumableStatusMap(
  user: SessionUser,
  treatmentItemIds: string[],
): Promise<Record<string, ConsumableStatus>> {
  if (!user.clinicId || treatmentItemIds.length === 0) return {};
  const db = tenantClient(user.clinicId);
  const usages = await db.treatmentConsumableUsage.findMany({
    where: {
      treatmentItemId: { in: treatmentItemIds },
      wasSkipped: false,
      inventoryMovementId: { not: null as string | null },
    },
    select: { treatmentItemId: true, isReversed: true },
  });

  const grouped = new Map<string, { active: number; reversed: number }>();
  for (const u of usages) {
    const g = grouped.get(u.treatmentItemId) ?? { active: 0, reversed: 0 };
    if (u.isReversed) g.reversed++;
    else g.active++;
    grouped.set(u.treatmentItemId, g);
  }

  const result: Record<string, ConsumableStatus> = {};
  for (const tid of treatmentItemIds) {
    const g = grouped.get(tid);
    if (!g || (g.active === 0 && g.reversed === 0)) {
      result[tid] = "none";
    } else if (g.active > 0 && g.reversed === 0) {
      result[tid] = "applied";
    } else if (g.active === 0 && g.reversed > 0) {
      result[tid] = "reversed";
    } else {
      result[tid] = "reapplied"; // active + reversed → re-applied after reversal
    }
  }
  return result;
}

/** Конвертация quantity/unit → base quantity/unit по InventoryItem. */
export function calculateBaseQuantity(
  quantity: number,
  unit: string,
  item: { unit: string; doseToBaseFactor: number | null },
): { baseQuantity: number; baseUnit: string } {
  if (unit === item.unit) {
    return { baseQuantity: quantity, baseUnit: item.unit };
  }
  if (unit === "dose") {
    if (!item.doseToBaseFactor || item.doseToBaseFactor <= 0) {
      throw new Error("doseUnitNotAllowed");
    }
    const baseQuantity = Math.round(quantity * item.doseToBaseFactor * 1000) / 1000;
    return { baseQuantity, baseUnit: item.unit };
  }
  throw new Error("unitUnsupported");
}
