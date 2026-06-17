/**
 * Данные шаблонов расходников услуг (server-only).
 * Только шаблоны — фактическое списание со склада в Session 34.
 * Все запросы scoped по clinicId из сессии.
 */
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

export interface ConsumableTemplateRow {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemUnit: string;
  doseToBaseFactor: number | null;
  quantity: number;
  unit: string;
  allowOverride: boolean;
  isRequired: boolean;
  note: string | null;
}

export interface ConsumableItemOption {
  id: string;
  name: string;
  unit: string;
  doseToBaseFactor: number | null;
  currentQty: number;
}

/** Шаблоны расходников для конкретной услуги, отсортированные по дате добавления. */
export async function listServiceConsumableTemplates(
  user: SessionUser,
  serviceId: string,
): Promise<ConsumableTemplateRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.serviceConsumableTemplate.findMany({
    where: { serviceId },
    include: {
      inventoryItem: { select: { name: true, unit: true, doseToBaseFactor: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    inventoryItemId: r.inventoryItemId,
    itemName: r.inventoryItem.name,
    itemUnit: r.inventoryItem.unit,
    doseToBaseFactor: r.inventoryItem.doseToBaseFactor
      ? Number(r.inventoryItem.doseToBaseFactor)
      : null,
    quantity: Number(r.quantity),
    unit: r.unit,
    allowOverride: r.allowOverride,
    isRequired: r.isRequired,
    note: r.note,
  }));
}

/** Список inventory items клиники для select в форме добавления шаблона. */
export async function listInventoryItemsForConsumable(
  user: SessionUser,
): Promise<ConsumableItemOption[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const items = await db.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, unit: true, doseToBaseFactor: true, quantity: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    doseToBaseFactor: i.doseToBaseFactor ? Number(i.doseToBaseFactor) : null,
    currentQty: Number(i.quantity),
  }));
}
