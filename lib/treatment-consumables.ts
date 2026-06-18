/**
 * Данные и helper для TreatmentConsumableUsage (Session 34).
 * Фактическое списание расходников по шаблонам ServiceConsumableTemplate.
 */
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
  isReversed: boolean;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
  reversalMovementId: string | null;
}

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

/** Уже применённые usage для treatmentItem. */
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
    isReversed: r.isReversed,
    reversedAt: r.reversedAt,
    reversedById: r.reversedById,
    reversalReason: r.reversalReason,
    reversalMovementId: r.reversalMovementId,
  }));
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
