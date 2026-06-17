import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listSuppliers } from "@/lib/suppliers";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierList } from "@/components/suppliers/SupplierList";

export default async function SuppliersPage() {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ts = t.suppliers;
  const canManage = hasPermission(user, "inventory.manage");

  const suppliers = await listSuppliers(user);

  return (
    <>
      <PageHeader
        title={ts.title}
        actions={
          canManage ? (
            <Link
              href="/inventory/suppliers/new"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" /> {ts.newSupplier}
            </Link>
          ) : undefined
        }
      />
      <SupplierList suppliers={suppliers} dict={ts} />
    </>
  );
}
