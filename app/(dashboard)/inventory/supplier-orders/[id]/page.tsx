import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getSupplierOrderForUser, buildSupplierOrderMessage } from "@/lib/supplier-orders";
import { listCatalogItems } from "@/lib/suppliers";
import { listInventoryItems } from "@/lib/inventory";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderDetailCard } from "@/components/supplier-orders/OrderDetailCard";
import { OrderItemsTable } from "@/components/supplier-orders/OrderItemsTable";
import { OrderStatusActions } from "@/components/supplier-orders/OrderStatusActions";
import { OrderMessageBlock } from "@/components/supplier-orders/OrderMessageBlock";
import { AddCatalogItemForm } from "@/components/supplier-orders/AddCatalogItemForm";

export default async function SupplierOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ts = t.supplierOrders;
  const canManage = hasPermission(user, "inventory.manage");

  const { id } = await params;
  const order = await getSupplierOrderForUser(user, id);
  if (!order) notFound();

  const isDraft = order.status === "draft";
  const isReceived = order.status === "received";

  const [catalogItems, inventoryItems] = await Promise.all([
    isDraft && canManage
      ? listCatalogItems(user, order.supplier.id, { activeOnly: true })
      : Promise.resolve([]),
    isReceived && canManage
      ? listInventoryItems(user, {})
      : Promise.resolve([]),
  ]);

  const message = buildSupplierOrderMessage(order, order.items);

  return (
    <>
      <PageHeader
        title={`${ts.orderNumber} ${order.number}`}
        actions={
          <Link
            href="/inventory/supplier-orders"
            className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="size-4" /> {ts.backToList}
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <OrderItemsTable order={order} dict={ts} canManage={canManage} inventoryItems={inventoryItems} />

          {isDraft && canManage && catalogItems.length > 0 && (
            <AddCatalogItemForm
              orderId={order.id}
              catalogItems={catalogItems}
              dict={ts}
            />
          )}

          {order.items.length > 0 && (
            <OrderMessageBlock message={message} dict={ts} />
          )}
        </div>

        <aside className="space-y-4">
          <OrderDetailCard order={order} dict={ts} />

          {canManage && (
            <OrderStatusActions order={order} dict={ts} />
          )}
        </aside>
      </div>
    </>
  );
}
