"use server";

/**
 * Supplier receiving server actions.
 * Receiving stock is separate from markSupplierOrderReceived — the user must
 * explicitly "Anbara qəbul et" per item after the order status is `received`.
 * Permission: inventory.manage.
 * clinicId always from session.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { receiveOrderItemSchema } from "@/lib/validation/supplier-orders";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import { issuesToFieldErrors } from "@/lib/validation/patients";

class ReceivingError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

export async function receiveSupplierOrderItem(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const parsed = receiveOrderItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  if (!input.inventoryItemId && !input.createNew) {
    return { error: "mustSelectOrCreate" };
  }

  const db = tenantClient(clinicId);
  let orderNumber = "";
  let supplierName = "";

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Load order item (tenant-isolated via clinicId)
      const orderItem = await tx.supplierOrderItem.findFirst({
        where: { id: input.orderItemId, clinicId },
        include: {
          order: { select: { id: true, status: true, number: true, supplier: { select: { name: true } } } },
        },
      });
      if (!orderItem) throw new ReceivingError("itemNotFound");
      if (orderItem.order.status === "draft") throw new ReceivingError("orderApprovalRequired");
      if (orderItem.order.status !== "received") throw new ReceivingError("orderNotReceived");
      if (orderItem.stockMovementId) throw new ReceivingError("orderItemAlreadyReceived");

      orderNumber = orderItem.order.number;
      supplierName = orderItem.order.supplier.name;

      // 2. Resolve or create InventoryItem
      let inventoryItemId: string;

      if (input.createNew) {
        // Create from snapshot data
        const unitCostGapik = Math.round(Number(orderItem.priceSnapshot) * 100);
        const newItem = await tx.inventoryItem.create({
          data: {
            clinicId,
            name: orderItem.nameSnapshot,
            sku: orderItem.skuSnapshot ?? undefined,
            unit: orderItem.unitSnapshot ?? "ədəd",
            quantity: 0, // will be updated below
            minQuantity: 0,
            unitCost: unitCostGapik > 0 ? unitCostGapik : null,
            supplierId: orderItem.order.supplier
              ? await db.supplier
                  .findFirst({ where: { name: orderItem.order.supplier.name, deletedAt: null }, select: { id: true } })
                  .then((s) => s?.id ?? null)
              : null,
          } as never,
          select: { id: true },
        });
        inventoryItemId = newItem.id;
      } else {
        // Verify existing item belongs to this clinic
        const existing = await tx.inventoryItem.findFirst({
          where: { id: input.inventoryItemId!, clinicId, deletedAt: null },
          select: { id: true },
        });
        if (!existing) throw new ReceivingError("inventoryItemNotFound");
        inventoryItemId = existing.id;
      }

      // 3. Advisory lock on inventory item
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"inv:" + inventoryItemId}))::text`;

      // 4. Load item for stock calc
      const invItem = await tx.inventoryItem.findFirst({
        where: { id: inventoryItemId, clinicId, deletedAt: null },
        select: { quantity: true, minQuantity: true },
      });
      if (!invItem) throw new ReceivingError("inventoryItemNotFound");

      const prev = Number(invItem.quantity);
      const next = Math.round((prev + input.receivedQty) * 1000) / 1000;
      const unitCostGapik = Math.round(Number(orderItem.priceSnapshot) * 100);
      const reason = `Anbar qəbulu: ${orderNumber} (${supplierName})`;

      // 5. Create stock movement
      const movement = await tx.inventoryMovement.create({
        data: {
          clinicId,
          inventoryItemId,
          type: "in_stock",
          quantity: input.receivedQty,
          unitCost: unitCostGapik > 0 ? unitCostGapik : null,
          reason,
          supplierOrderId: orderItem.order.id,
          performedById: user.id,
        } as never,
        select: { id: true },
      });

      // 6. Update inventory quantity
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { quantity: next },
      });

      // 7. Mark order item as received
      await tx.supplierOrderItem.update({
        where: { id: input.orderItemId },
        data: {
          inventoryItemId,
          receivedQty: input.receivedQty,
          receivedAt: new Date(),
          receivedById: user.id,
          stockMovementId: movement.id,
        } as never,
      });
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "supplier_order_item_received",
        entityId: input.orderItemId,
        after: { receivedQty: input.receivedQty, orderNumber, supplierName },
      },
    } as never);
  } catch (e) {
    if (e instanceof ReceivingError) return { error: e.key };
    console.error("receiveSupplierOrderItem failed:", e);
    return { error: "generic" };
  }

  // Derive orderId for revalidation by querying outside tx
  const item = await db.supplierOrderItem.findFirst({
    where: { id: input.orderItemId },
    select: { supplierOrderId: true },
  });

  revalidatePath(`/inventory/supplier-orders/${item?.supplierOrderId ?? ""}`);
  revalidatePath("/inventory");
  return { success: "receiveSuccess" };
}
