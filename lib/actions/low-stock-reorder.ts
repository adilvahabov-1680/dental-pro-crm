"use server";

/**
 * Create supplier order draft(s) from selected low-stock items (Session 39).
 * User-confirmed only: no auto-send, no auto-receiving, no stock mutation,
 * no InventoryMovement. Reuses the existing draft/sent/received/cancelled
 * SupplierOrder flow (Session 29-30) — no schema changes.
 * clinicId always from session. Selected items are grouped by supplier;
 * one draft order per supplier (existing draft is reused, not duplicated).
 */
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { buildReorderDraftPreview } from "@/lib/low-stock-reorder";
import { getOrCreateDraftSupplierOrder } from "@/lib/supplier-orders";
import { reorderDraftRowSchema, reorderDraftNoteSchema } from "@/lib/validation/low-stock-reorder";
import type { LowStockReorderActionState } from "@/lib/validation/low-stock-reorder";

class ReorderError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

export async function createSupplierOrderDraftsFromLowStockAction(
  _prev: LowStockReorderActionState | undefined,
  formData: FormData,
): Promise<LowStockReorderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  // Flat FormData → items[N].field, same convention as applyTreatmentConsumablesAction.
  const rawItems: Record<string, Record<string, string>> = {};
  for (const [key, val] of formData.entries()) {
    const m = key.match(/^items\[(\d+)\]\.(.+)$/);
    if (m) {
      const [, idx, field] = m;
      if (!rawItems[idx]) rawItems[idx] = {};
      rawItems[idx][field] = val.toString();
    }
  }

  const selectedQuantities = new Map<string, number>();
  for (const raw of Object.values(rawItems)) {
    if (raw.selected !== "on" && raw.selected !== "true") continue;
    const parsed = reorderDraftRowSchema.safeParse(raw);
    if (!parsed.success) return { error: "quantityInvalid" };
    selectedQuantities.set(parsed.data.inventoryItemId, parsed.data.quantity);
  }

  const selectedIds = [...selectedQuantities.keys()];
  if (selectedIds.length === 0) return { error: "noItemsSelected" };

  const noteParsed = reorderDraftNoteSchema.safeParse(formData.get("note")?.toString() ?? "");
  const note = noteParsed.success ? noteParsed.data : null;

  const db = tenantClient(clinicId);

  try {
    const preview = await buildReorderDraftPreview(user, selectedIds);
    if (preview.groups.length === 0) return { error: "noSupplierItems" };

    const createdOrders: NonNullable<LowStockReorderActionState["createdOrders"]> = [];

    for (const group of preview.groups) {
      const { id: orderId, number: orderNumber, isNew } = await getOrCreateDraftSupplierOrder(
        user,
        group.supplierId,
      );

      if (isNew) {
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: "create",
            entityType: "supplierOrder",
            entityId: orderId,
            after: { supplierId: group.supplierId, number: orderNumber, source: "low_stock_reorder" },
          },
        } as never);
        if (note) {
          await db.supplierOrder.update({ where: { id: orderId }, data: { notes: note } as never });
        }
      }

      for (const item of group.items) {
        const quantity = selectedQuantities.get(item.inventoryItemId);
        if (!quantity) continue;

        const unitCost = item.unitCostGapik ?? 0;
        const priceNum = unitCost / 100;

        const existing = await db.supplierOrderItem.findFirst({
          where: { supplierOrderId: orderId, inventoryItemId: item.inventoryItemId },
          select: { id: true, quantity: true },
        });

        if (existing) {
          const newQty = Number(existing.quantity) + quantity;
          await db.supplierOrderItem.update({
            where: { id: existing.id },
            data: { quantity: String(newQty) } as never,
          });
        } else {
          await db.supplierOrderItem.create({
            data: {
              supplierOrderId: orderId,
              inventoryItemId: item.inventoryItemId,
              quantity: String(quantity),
              unitCost,
              nameSnapshot: item.name,
              skuSnapshot: item.sku ?? null,
              unitSnapshot: item.unit,
              priceSnapshot: String(priceNum),
              currencySnapshot: "AZN",
            } as never,
          });
        }
      }

      const allItems = await db.supplierOrderItem.findMany({
        where: { supplierOrderId: orderId },
        select: { quantity: true, unitCost: true },
      });
      const total = allItems.reduce(
        (s, i) => s + (i.unitCost * Math.round(Number(i.quantity) * 1000)) / 1000,
        0,
      );
      await db.supplierOrder.update({ where: { id: orderId }, data: { totalCost: Math.round(total) } as never });

      createdOrders.push({ orderId, orderNumber, supplierName: group.supplierName, isNew });
    }

    revalidatePath("/inventory/alerts");
    revalidatePath("/inventory/supplier-orders");
    for (const o of createdOrders) revalidatePath(`/inventory/supplier-orders/${o.orderId}`);

    return { createdOrders };
  } catch (e) {
    if (e instanceof ReorderError) return { error: e.key };
    console.error("createSupplierOrderDraftsFromLowStockAction failed:", e);
    return { error: "generic" };
  }
}
