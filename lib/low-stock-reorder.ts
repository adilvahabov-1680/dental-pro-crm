/**
 * Supplier reorder draft preview, built from low-stock items (Session 39).
 * Read-only — groups selected InventoryItems by supplier and computes
 * default order quantities (Session 38 reorder formula). Does not write
 * anything; the actual draft creation happens in
 * lib/actions/low-stock-reorder.ts.
 */
import { tenantClient } from "@/lib/tenant";
import { calculateReorderSuggestion } from "@/lib/low-stock";
import type { SessionUser } from "@/types/auth";

export interface ReorderPreviewItem {
  inventoryItemId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  suggestedBaseQuantity: number;
  suggestedPurchaseUnits: number | null;
  purchaseUnit: string | null;
  unitCostGapik: number | null;
}

export interface ReorderPreviewGroup {
  supplierId: string;
  supplierName: string;
  items: ReorderPreviewItem[];
}

export interface ReorderDraftPreview {
  groups: ReorderPreviewGroup[];
  excludedNoSupplier: Array<{ inventoryItemId: string; name: string }>;
}

/** Groups the given inventory item ids by supplier (clinicId-scoped). Items without a supplier are excluded. */
export async function buildReorderDraftPreview(
  user: SessionUser,
  itemIds: string[],
): Promise<ReorderDraftPreview> {
  if (!user.clinicId || itemIds.length === 0) return { groups: [], excludedNoSupplier: [] };
  const db = tenantClient(user.clinicId);
  const items = await db.inventoryItem.findMany({
    where: { id: { in: itemIds }, deletedAt: null, isActive: true },
    include: { supplier: { select: { id: true, name: true } } },
  });

  const groupsMap = new Map<string, ReorderPreviewGroup>();
  const excludedNoSupplier: ReorderDraftPreview["excludedNoSupplier"] = [];

  for (const item of items) {
    const quantity = Number(item.quantity);
    const minQuantity = Number(item.minQuantity);
    const { suggestedBaseQuantity, suggestedPurchaseUnits } = calculateReorderSuggestion({
      quantity,
      minQuantity,
      purchaseUnit: item.purchaseUnit,
      purchaseToBaseFactor: Number(item.purchaseToBaseFactor),
    });
    const previewItem: ReorderPreviewItem = {
      inventoryItemId: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity,
      minQuantity,
      suggestedBaseQuantity,
      suggestedPurchaseUnits,
      purchaseUnit: item.purchaseUnit,
      unitCostGapik: item.unitCost ?? null,
    };
    if (!item.supplier) {
      excludedNoSupplier.push({ inventoryItemId: item.id, name: item.name });
      continue;
    }
    const group = groupsMap.get(item.supplier.id) ?? {
      supplierId: item.supplier.id,
      supplierName: item.supplier.name,
      items: [],
    };
    group.items.push(previewItem);
    groupsMap.set(item.supplier.id, group);
  }

  return { groups: [...groupsMap.values()], excludedNoSupplier };
}
