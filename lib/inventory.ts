/**
 * Данные модуля Anbar (server-only).
 * Склад — общеклиничный (без пациентского scope): доступ по inventory.view,
 * управление — inventory.manage; списание на процедуру — treatments.manage
 * (медицинское действие врача, см. docs/INVENTORY.md).
 * Остаток (quantity) — кэш суммы движений; движения append-only.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

export type InventoryStatus = "normal" | "low" | "out" | "expiring";

export const EXPIRING_SOON_DAYS = 30;

/** Статус материала: out > low > expiring > normal. */
export function inventoryStatus(item: {
  quantity: Prisma.Decimal | number;
  minQuantity: Prisma.Decimal | number;
  expiresAt: Date | null;
}): InventoryStatus {
  const qty = Number(item.quantity);
  const min = Number(item.minQuantity);
  if (qty <= 0) return "out";
  if (qty <= min) return "low";
  if (item.expiresAt) {
    const soon = new Date();
    soon.setDate(soon.getDate() + EXPIRING_SOON_DAYS);
    if (item.expiresAt <= soon) return "expiring";
  }
  return "normal";
}

export function formatQty(q: Prisma.Decimal | number): string {
  return Number(q).toLocaleString("az-AZ", { maximumFractionDigits: 3 });
}

const itemInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

export type InventoryItemFull = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

export interface InventoryFilters {
  q?: string;
  categoryId?: string;
  low?: boolean;
}

export async function listInventoryItems(
  user: SessionUser,
  filters: InventoryFilters,
): Promise<InventoryItemFull[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.InventoryItemWhereInput[] = [{ deletedAt: null, isActive: true }];
  if (filters.q) and.push({ name: { contains: filters.q.trim(), mode: "insensitive" } });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  const items = (await db.inventoryItem.findMany({
    where: { AND: and },
    include: itemInclude,
    orderBy: { name: "asc" },
    take: 200,
  })) as InventoryItemFull[];
  // low-фильтр — по вычисляемому статусу (quantity ≤ minQuantity)
  return filters.low
    ? items.filter((i) => ["low", "out"].includes(inventoryStatus(i)))
    : items;
}

/** Материал клиники по id; чужой → null. */
export async function getInventoryItemForUser(
  user: SessionUser,
  id: string,
): Promise<InventoryItemFull | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.inventoryItem.findFirst({
    where: { id, deletedAt: null },
    include: itemInclude,
  })) as InventoryItemFull | null;
}

export interface MovementRow {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  treatmentItemId: string | null;
  performedByName: string;
  createdAt: Date;
}

export async function listItemMovements(
  user: SessionUser,
  inventoryItemId: string,
): Promise<MovementRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.inventoryMovement.findMany({
    where: { inventoryItemId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.performedById))] }, clinicId: user.clinicId },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    quantity: Number(r.quantity),
    reason: r.reason,
    note: r.note,
    treatmentItemId: r.treatmentItemId,
    performedByName: names.get(r.performedById) ?? "—",
    createdAt: r.createdAt,
  }));
}

/** Summary-карточки /inventory. */
export async function inventorySummary(user: SessionUser) {
  if (!user.clinicId) return { total: 0, low: 0, out: 0, monthUsage: 0 };
  const db = tenantClient(user.clinicId);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [items, monthUsage] = await Promise.all([
    db.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      select: { quantity: true, minQuantity: true, expiresAt: true },
    }),
    db.inventoryMovement.count({
      where: { type: "out_stock", createdAt: { gte: monthStart } },
    }),
  ]);
  let low = 0;
  let out = 0;
  for (const i of items) {
    const s = inventoryStatus(i);
    if (s === "low") low++;
    if (s === "out") out++;
  }
  return { total: items.length, low, out, monthUsage };
}

/** Материалы с низким/нулевым остатком (для LowStockPanel). */
export async function listLowStockItems(user: SessionUser): Promise<InventoryItemFull[]> {
  return listInventoryItems(user, { low: true });
}

export async function listInventoryCategories(user: SessionUser) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.inventoryCategory.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface TreatmentMaterialRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  createdAt: Date;
}

/** Использованные материалы процедуры. */
export async function listTreatmentMaterials(
  user: SessionUser,
  treatmentItemId: string,
): Promise<TreatmentMaterialRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentItemMaterial.findMany({
    where: { treatmentItemId },
    include: { inventoryItem: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.inventoryItem.name,
    unit: r.inventoryItem.unit,
    quantity: Number(r.quantity),
    unitCost: r.unitCost,
    createdAt: r.createdAt,
  }));
}
