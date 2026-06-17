/**
 * Supplier orders data access (server-only).
 * Permissions: inventory.view (read), inventory.manage (write).
 * clinicId always from session — never from client input.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

const orderSelect = {
  id: true,
  number: true,
  status: true,
  totalCost: true,
  sentAt: true,
  orderedAt: true,
  receivedAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: { id: true, name: true, phone: true, whatsapp: true, email: true } },
  createdById: true,
} satisfies Prisma.SupplierOrderSelect;

export type SupplierOrderRow = Prisma.SupplierOrderGetPayload<{ select: typeof orderSelect }>;

const orderItemSelect = {
  id: true,
  clinicId: true,
  supplierOrderId: true,
  catalogItemId: true,
  inventoryItemId: true,
  quantity: true,
  unitCost: true,
  nameSnapshot: true,
  skuSnapshot: true,
  unitSnapshot: true,
  priceSnapshot: true,
  currencySnapshot: true,
  createdAt: true,
} satisfies Prisma.SupplierOrderItemSelect;

export type SupplierOrderItemRow = Prisma.SupplierOrderItemGetPayload<{
  select: typeof orderItemSelect;
}>;

export type SupplierOrderFull = SupplierOrderRow & {
  items: SupplierOrderItemRow[];
};

export async function listSupplierOrders(user: SessionUser): Promise<SupplierOrderRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.supplierOrder.findMany({
    where: { deletedAt: null },
    select: orderSelect,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getSupplierOrderForUser(
  user: SessionUser,
  id: string,
): Promise<SupplierOrderFull | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  const order = await db.supplierOrder.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...orderSelect,
      items: { select: orderItemSelect, orderBy: { createdAt: "asc" } },
    },
  });
  return order as SupplierOrderFull | null;
}

/** Get or create a draft order for a given supplier. One draft per supplier at a time. */
export async function getOrCreateDraftSupplierOrder(
  user: SessionUser,
  supplierId: string,
): Promise<{ id: string; number: string; isNew: boolean }> {
  if (!user.clinicId) throw new Error("noClinic");
  const db = tenantClient(user.clinicId);

  const existing = await db.supplierOrder.findFirst({
    where: { supplierId, status: "draft", deletedAt: null },
    select: { id: true, number: true },
  });
  if (existing) return { ...existing, isNew: false };

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
    select: { id: true, number: true },
  });
  return { ...created, isNew: true };
}

export function calculateOrderTotals(items: SupplierOrderItemRow[]): {
  totalCost: number;
  itemCount: number;
} {
  let totalCost = 0;
  for (const item of items) {
    totalCost += item.unitCost * Math.round(Number(item.quantity) * 1000) / 1000;
  }
  return { totalCost: Math.round(totalCost), itemCount: items.length };
}

/** Build AZ-language order message for WhatsApp / email (manual copy only). */
export function buildSupplierOrderMessage(
  order: SupplierOrderRow,
  items: SupplierOrderItemRow[],
): string {
  const lines: string[] = [];
  lines.push(`Hörmətli ${order.supplier.name},`);
  lines.push(``);
  lines.push(`Sifariş nömrəsi: ${order.number}`);
  lines.push(`Tarix: ${new Date().toLocaleDateString("az-AZ")}`);
  lines.push(``);
  lines.push(`Sifariş edilən məhsullar:`);
  lines.push(`──────────────────────────`);

  for (const item of items) {
    const qty = Number(item.quantity);
    const unit = item.unitSnapshot ?? "ədəd";
    const price = `${Number(item.priceSnapshot).toFixed(2)} ${item.currencySnapshot}`;
    const sku = item.skuSnapshot ? ` (${item.skuSnapshot})` : "";
    lines.push(`• ${item.nameSnapshot}${sku}`);
    lines.push(`  ${qty} ${unit} × ${price}`);
  }

  lines.push(`──────────────────────────`);
  const total = (
    items.reduce((s, i) => s + Number(i.priceSnapshot) * Number(i.quantity), 0)
  ).toFixed(2);
  lines.push(`Cəmi: ${total} ${items[0]?.currencySnapshot ?? "AZN"}`);

  if (order.notes) {
    lines.push(``);
    lines.push(`Qeyd: ${order.notes}`);
  }

  lines.push(``);
  lines.push(`Hörmətlə,`);
  lines.push(`Klinika administrasiyası`);

  return lines.join("\n");
}
