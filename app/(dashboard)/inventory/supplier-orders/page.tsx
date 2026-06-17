import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listSupplierOrders } from "@/lib/supplier-orders";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierOrdersList } from "@/components/supplier-orders/SupplierOrdersList";

export default async function SupplierOrdersPage() {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ts = t.supplierOrders;

  const orders = await listSupplierOrders(user);

  return (
    <>
      <PageHeader
        title={ts.title}
        actions={
          <Link
            href="/inventory/suppliers"
            className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="size-4" /> {t.suppliers.title}
          </Link>
        }
      />
      <SupplierOrdersList orders={orders} dict={ts} />
    </>
  );
}
