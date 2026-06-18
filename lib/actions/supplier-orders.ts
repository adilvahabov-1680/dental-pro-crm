"use server";

/**
 * Server actions for Supplier Orders module.
 * Status flow: draft → sent → received/cancelled.
 * clinicId always from session. Snapshot fields captured at item-add time.
 * No automatic email/WhatsApp — message text is for manual copy only.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { issuesToFieldErrors } from "@/lib/validation/patients";
import {
  addCatalogItemSchema,
  updateOrderItemQtySchema,
  removeOrderItemSchema,
  orderIdSchema,
  updateOrderNotesSchema,
  type SupplierOrderActionState,
} from "@/lib/validation/supplier-orders";

class OrderError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

// ── Create draft ──────────────────────────────────────────────────────────────

export async function createSupplierOrderDraft(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const supplierId = formData.get("supplierId") as string;
  if (!supplierId) return { error: "generic" };

  const db = tenantClient(user.clinicId);
  let orderId: string;
  try {
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) return { error: "notFound" };

    const existing = await db.supplierOrder.findFirst({
      where: { supplierId, status: "draft", deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      orderId = existing.id;
    } else {
      const count = await db.supplierOrder.count();
      const number = `SO-${String(count + 1).padStart(4, "0")}`;
      const created = await db.supplierOrder.create({
        data: {
          supplierId,
          number,
          status: "draft",
          totalCost: 0,
          createdById: user.id,
        } as never,
        select: { id: true },
      });
      orderId = (created as { id: string }).id;

      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "create",
          entityType: "supplierOrder",
          entityId: orderId,
          after: { supplierId, number },
        },
      } as never);
    }
  } catch (e) {
    console.error("createSupplierOrderDraft failed:", e);
    return { error: "generic" };
  }

  redirect(`/inventory/supplier-orders/${orderId}`);
}

// ── Add catalog item ──────────────────────────────────────────────────────────

export async function addCatalogItemToSupplierOrder(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = addCatalogItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const { orderId, catalogItemId, quantity } = parsed.data;

  if (quantity <= 0) return { fieldErrors: { quantity: "quantityInvalid" } };

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, supplierId: true, status: true },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status !== "draft") throw new OrderError("orderNotDraft");

    const catalogItem = await db.supplierCatalogItem.findFirst({
      where: { id: catalogItemId, deletedAt: null, isActive: true },
      select: {
        id: true,
        supplierId: true,
        name: true,
        sku: true,
        unit: true,
        price: true,
        currency: true,
      },
    });
    if (!catalogItem) throw new OrderError("catalogItemNotFound");
    if (catalogItem.supplierId !== order.supplierId) throw new OrderError("supplierMismatch");

    const priceNum = Number(catalogItem.price);
    const unitCost = Math.round(priceNum * 100);

    const existing = await db.supplierOrderItem.findFirst({
      where: { supplierOrderId: orderId, catalogItemId },
      select: { id: true, quantity: true, unitCost: true },
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
          catalogItemId,
          quantity: String(quantity),
          unitCost,
          nameSnapshot: catalogItem.name,
          skuSnapshot: catalogItem.sku ?? null,
          unitSnapshot: catalogItem.unit ?? null,
          priceSnapshot: String(priceNum),
          currencySnapshot: catalogItem.currency,
        } as never,
      });
    }

    await recalcOrderTotal(db, orderId, user.clinicId);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("addCatalogItemToSupplierOrder failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  return { orderId };
}

// ── Update item quantity ──────────────────────────────────────────────────────

export async function updateSupplierOrderItemQty(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = updateOrderItemQtySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const { orderItemId, quantity } = parsed.data;

  if (quantity <= 0) return { fieldErrors: { quantity: "quantityInvalid" } };

  const db = tenantClient(user.clinicId);
  let orderId: string;
  try {
    const item = await db.supplierOrderItem.findFirst({
      where: { id: orderItemId },
      select: { id: true, supplierOrderId: true, order: { select: { status: true } } },
    });
    if (!item) throw new OrderError("itemNotFound");
    if (item.order.status !== "draft") throw new OrderError("orderNotDraft");
    orderId = item.supplierOrderId;

    await db.supplierOrderItem.update({
      where: { id: orderItemId },
      data: { quantity: String(quantity) } as never,
    });

    await recalcOrderTotal(db, orderId, user.clinicId);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("updateSupplierOrderItemQty failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  return { orderId };
}

// ── Remove item ───────────────────────────────────────────────────────────────

export async function removeSupplierOrderItem(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = removeOrderItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderItemId } = parsed.data;

  const db = tenantClient(user.clinicId);
  let orderId: string;
  try {
    const item = await db.supplierOrderItem.findFirst({
      where: { id: orderItemId },
      select: { id: true, supplierOrderId: true, order: { select: { status: true } } },
    });
    if (!item) throw new OrderError("itemNotFound");
    if (item.order.status !== "draft") throw new OrderError("orderNotDraft");
    orderId = item.supplierOrderId;

    await db.supplierOrderItem.delete({ where: { id: orderItemId } });
    await recalcOrderTotal(db, orderId, user.clinicId);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("removeSupplierOrderItem failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  return { orderId };
}

// ── Update notes ──────────────────────────────────────────────────────────────

export async function updateSupplierOrderNotes(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = updateOrderNotesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderId, notes } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status !== "draft") throw new OrderError("orderNotDraft");

    await db.supplierOrder.update({
      where: { id: orderId },
      data: { notes } as never,
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("updateSupplierOrderNotes failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  return { orderId };
}

// ── Confirm draft (approval flow, Session 40) ──────────────────────────────────

/**
 * Explicit user confirmation that a draft order is correct and ready to proceed.
 * draft -> approved only. Does NOT send anything to the supplier, does NOT touch
 * stock/InventoryMovement, does NOT receive — purely an internal status transition.
 * Reuses the existing unused SupplierOrder.orderedAt timestamp for "confirmed at".
 */
export async function confirmSupplierOrderDraftAction(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) return { error: "unauthorized" };

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderId } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true, items: { select: { id: true } } },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status !== "draft") throw new OrderError("orderNotDraft");
    if (order.items.length === 0) throw new OrderError("orderEmpty");

    await db.supplierOrder.update({
      where: { id: orderId },
      data: { status: "approved", orderedAt: new Date() } as never,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "supplierOrder",
        entityId: orderId,
        after: { status: "approved" },
      },
    } as never);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("confirmSupplierOrderDraftAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  revalidatePath("/inventory/supplier-orders");
  revalidatePath("/inventory/alerts");
  return { orderId, success: "confirmSuccess" };
}

// ── Mark sent ─────────────────────────────────────────────────────────────────

export async function markSupplierOrderSent(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderId } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true, items: { select: { id: true } } },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status !== "draft" && order.status !== "approved") throw new OrderError("orderNotDraft");
    if (order.items.length === 0) throw new OrderError("orderEmpty");

    await db.supplierOrder.update({
      where: { id: orderId },
      data: { status: "sent", sentAt: new Date() } as never,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "supplierOrder",
        entityId: orderId,
        after: { status: "sent" },
      },
    } as never);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("markSupplierOrderSent failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  revalidatePath("/inventory/supplier-orders");
  return { orderId };
}

// ── Mark received ─────────────────────────────────────────────────────────────

export async function markSupplierOrderReceived(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderId } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status !== "sent") throw new OrderError("orderNotSent");

    await db.supplierOrder.update({
      where: { id: orderId },
      data: { status: "received", receivedAt: new Date() } as never,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "supplierOrder",
        entityId: orderId,
        after: { status: "received" },
      },
    } as never);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("markSupplierOrderReceived failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  revalidatePath("/inventory/supplier-orders");
  return { orderId };
}

// ── Cancel order ──────────────────────────────────────────────────────────────

export async function cancelSupplierOrder(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { orderId } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const order = await db.supplierOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!order) throw new OrderError("orderNotFound");
    if (order.status === "received") throw new OrderError("orderAlreadyReceived");
    if (order.status === "cancelled") throw new OrderError("orderAlreadyCancelled");

    await db.supplierOrder.update({
      where: { id: orderId },
      data: { status: "cancelled" } as never,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "supplierOrder",
        entityId: orderId,
        after: { status: "cancelled" },
      },
    } as never);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("cancelSupplierOrder failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/supplier-orders/${orderId}`);
  revalidatePath("/inventory/supplier-orders");
  return { orderId };
}

// ── Add catalog item from supplier page (get/create draft + add) ──────────────

export async function addCatalogItemToOrderFromSupplierPage(
  _prev: SupplierOrderActionState | undefined,
  formData: FormData,
): Promise<SupplierOrderActionState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const supplierId = formData.get("supplierId") as string;
  const catalogItemId = formData.get("catalogItemId") as string;
  const quantityStr = (formData.get("quantity") as string) ?? "1";

  if (!supplierId || !catalogItemId) return { error: "generic" };

  const quantity = parseFloat(quantityStr);
  if (!quantity || quantity <= 0) return { fieldErrors: { quantity: "quantityInvalid" } };

  const db = tenantClient(user.clinicId);
  let orderId: string;
  try {
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) return { error: "notFound" };

    const existing = await db.supplierOrder.findFirst({
      where: { supplierId, status: "draft", deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      orderId = existing.id;
    } else {
      const count = await db.supplierOrder.count();
      const number = `SO-${String(count + 1).padStart(4, "0")}`;
      const created = await db.supplierOrder.create({
        data: { supplierId, number, status: "draft", totalCost: 0, createdById: user.id } as never,
        select: { id: true },
      });
      orderId = (created as { id: string }).id;
      await db.auditLog.create({
        data: { userId: user.id, action: "create", entityType: "supplierOrder", entityId: orderId, after: { supplierId, number } },
      } as never);
    }

    const catalogItem = await db.supplierCatalogItem.findFirst({
      where: { id: catalogItemId, deletedAt: null, isActive: true },
      select: { id: true, supplierId: true, name: true, sku: true, unit: true, price: true, currency: true },
    });
    if (!catalogItem) throw new OrderError("catalogItemNotFound");
    if (catalogItem.supplierId !== supplierId) throw new OrderError("supplierMismatch");

    const priceNum = Number(catalogItem.price);
    const unitCost = Math.round(priceNum * 100);

    const existingItem = await db.supplierOrderItem.findFirst({
      where: { supplierOrderId: orderId, catalogItemId },
      select: { id: true, quantity: true },
    });

    if (existingItem) {
      const newQty = Number(existingItem.quantity) + quantity;
      await db.supplierOrderItem.update({ where: { id: existingItem.id }, data: { quantity: String(newQty) } as never });
    } else {
      await db.supplierOrderItem.create({
        data: {
          supplierOrderId: orderId, catalogItemId, quantity: String(quantity), unitCost,
          nameSnapshot: catalogItem.name, skuSnapshot: catalogItem.sku ?? null,
          unitSnapshot: catalogItem.unit ?? null, priceSnapshot: String(priceNum),
          currencySnapshot: catalogItem.currency,
        } as never,
      });
    }

    await recalcOrderTotal(db, orderId, user.clinicId);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.key };
    console.error("addCatalogItemToOrderFromSupplierPage failed:", e);
    return { error: "generic" };
  }

  redirect(`/inventory/supplier-orders/${orderId}`);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type DbClient = ReturnType<typeof tenantClient>;

async function recalcOrderTotal(db: DbClient, orderId: string, _clinicId: string) {
  const items = await db.supplierOrderItem.findMany({
    where: { supplierOrderId: orderId },
    select: { quantity: true, unitCost: true },
  });
  const total = items.reduce(
    (s, i) => s + i.unitCost * Math.round(Number(i.quantity) * 1000) / 1000,
    0,
  );
  await db.supplierOrder.update({
    where: { id: orderId },
    data: { totalCost: Math.round(total) } as never,
  });
}
