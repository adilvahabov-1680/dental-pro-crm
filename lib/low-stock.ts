/**
 * Stok xəbərdarlıqları / reorder tövsiyələri (Session 38, read-only).
 * Mövcud quantity/minQuantity/purchaseUnit/purchaseToBaseFactor sahələri üzərində.
 * Heç bir stock mutasiyası, heç bir avtomatik sifariş yaradılmır.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

export type LowStockAlertStatus = "out_of_stock" | "low_stock" | "warning" | "ok";

/** out > low > warning > ok. Warning həddi = minQuantity × 1.5. */
export function computeAlertStatus(quantity: number, minQuantity: number): LowStockAlertStatus {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= minQuantity) return "low_stock";
  if (quantity <= minQuantity * 1.5) return "warning";
  return "ok";
}

export interface ReorderSuggestion {
  suggestedBaseQuantity: number;
  suggestedPurchaseUnits: number | null;
}

/**
 * suggestedBaseQuantity = max(minQuantity*2 - quantity, minQuantity)
 * suggestedPurchaseUnits = ceil(suggestedBaseQuantity / purchaseToBaseFactor), yalnız purchaseUnit varsa.
 */
export function calculateReorderSuggestion(item: {
  quantity: number;
  minQuantity: number;
  purchaseUnit: string | null;
  purchaseToBaseFactor: number;
}): ReorderSuggestion {
  if (item.minQuantity <= 0) {
    return { suggestedBaseQuantity: 0, suggestedPurchaseUnits: null };
  }
  const raw = Math.max(item.minQuantity * 2 - item.quantity, item.minQuantity);
  const suggestedBaseQuantity = Math.round(raw * 1000) / 1000;
  const suggestedPurchaseUnits =
    item.purchaseUnit && item.purchaseToBaseFactor > 0
      ? Math.ceil(suggestedBaseQuantity / item.purchaseToBaseFactor)
      : null;
  return { suggestedBaseQuantity, suggestedPurchaseUnits };
}

export interface LowStockAlertRow {
  id: string;
  name: string;
  categoryName: string | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  status: LowStockAlertStatus;
  suggestedBaseQuantity: number;
  suggestedPurchaseUnits: number | null;
  purchaseUnit: string | null;
  supplierId: string | null;
  supplierName: string | null;
}

export type LowStockStatusFilter = "attention" | "all" | "out_of_stock" | "low_stock" | "warning";

export interface LowStockAlertParams {
  status?: LowStockStatusFilter;
  q?: string;
  categoryId?: string;
}

const alertItemInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

/** Bütün aktiv materiallar üçün alert sətirləri (filterdən əvvəl), clinicId-scoped. */
async function loadAlertRows(
  user: SessionUser,
  params: Pick<LowStockAlertParams, "q" | "categoryId">,
): Promise<LowStockAlertRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.InventoryItemWhereInput[] = [{ deletedAt: null, isActive: true }];
  if (params.q) and.push({ name: { contains: params.q.trim(), mode: "insensitive" } });
  if (params.categoryId) and.push({ categoryId: params.categoryId });

  const items = await db.inventoryItem.findMany({
    where: { AND: and },
    include: alertItemInclude,
    orderBy: { name: "asc" },
  });

  return items.map((item) => {
    const quantity = Number(item.quantity);
    const minQuantity = Number(item.minQuantity);
    const status = computeAlertStatus(quantity, minQuantity);
    const { suggestedBaseQuantity, suggestedPurchaseUnits } = calculateReorderSuggestion({
      quantity,
      minQuantity,
      purchaseUnit: item.purchaseUnit,
      purchaseToBaseFactor: Number(item.purchaseToBaseFactor),
    });
    return {
      id: item.id,
      name: item.name,
      categoryName: item.category?.name ?? null,
      unit: item.unit,
      quantity,
      minQuantity,
      status,
      suggestedBaseQuantity,
      suggestedPurchaseUnits,
      purchaseUnit: item.purchaseUnit,
      supplierId: item.supplier?.id ?? null,
      supplierName: item.supplier?.name ?? null,
    };
  });
}

/** `/inventory/alerts` siyahısı. Default ("attention") = out+low+warning, ok-lar gizli. */
export async function listLowStockAlerts(
  user: SessionUser,
  params: LowStockAlertParams = {},
): Promise<LowStockAlertRow[]> {
  const rows = await loadAlertRows(user, params);
  const status = params.status ?? "attention";
  if (status === "all") return rows;
  if (status === "attention") return rows.filter((r) => r.status !== "ok");
  return rows.filter((r) => r.status === status);
}

export interface LowStockAlertSummary {
  outOfStock: number;
  lowStock: number;
  warning: number;
  needsAttention: number;
  totalItems: number;
}

/** Summary kartları üçün say (bütün materiallar üzrə, filtersiz). */
export async function getLowStockAlertSummary(user: SessionUser): Promise<LowStockAlertSummary> {
  if (!user.clinicId) {
    return { outOfStock: 0, lowStock: 0, warning: 0, needsAttention: 0, totalItems: 0 };
  }
  const db = tenantClient(user.clinicId);
  const items = await db.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: { quantity: true, minQuantity: true },
  });
  let outOfStock = 0;
  let lowStock = 0;
  let warning = 0;
  for (const i of items) {
    const status = computeAlertStatus(Number(i.quantity), Number(i.minQuantity));
    if (status === "out_of_stock") outOfStock++;
    else if (status === "low_stock") lowStock++;
    else if (status === "warning") warning++;
  }
  return {
    outOfStock,
    lowStock,
    warning,
    needsAttention: outOfStock + lowStock + warning,
    totalItems: items.length,
  };
}
