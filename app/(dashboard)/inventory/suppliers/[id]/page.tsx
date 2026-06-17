import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  getSupplierForUser,
  listCatalogItems,
  listCatalogCategories,
  type CatalogFilters,
} from "@/lib/suppliers";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierDetailCard } from "@/components/suppliers/SupplierDetailCard";
import { ImportExcelForm } from "@/components/suppliers/ImportExcelForm";
import { CatalogTable } from "@/components/suppliers/CatalogTable";
import { CatalogFilterBar } from "@/components/suppliers/CatalogFilterBar";
import { DeactivateSupplierButton } from "@/components/suppliers/DeactivateSupplierButton";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ts = t.suppliers;
  const canManage = hasPermission(user, "inventory.manage");

  const { id } = await params;
  const supplier = await getSupplierForUser(user, id);
  if (!supplier) notFound();

  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const showInactive = s("inactive") === "1";

  const filters: CatalogFilters = {
    q: s("q"),
    category: s("category"),
    activeOnly: !showInactive,
  };

  const [items, categories] = await Promise.all([
    listCatalogItems(user, id, filters),
    listCatalogCategories(user, id),
  ]);

  return (
    <>
      <PageHeader
        title={supplier.name}
        actions={
          <Link
            href="/inventory/suppliers"
            className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="size-4" /> {ts.backToList}
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {ts.catalogTitle}
          </h2>

          <CatalogFilterBar
            categories={categories}
            dict={ts}
            supplierId={id}
          />

          <CatalogTable items={items} dict={ts} canManage={canManage} />

          {items.length > 0 && (
            <p className="text-sm tabular-nums text-text-secondary">
              {items.length} məhsul
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <SupplierDetailCard supplier={supplier} dict={ts} canManage={canManage} />

          {canManage && (
            <ImportExcelForm supplierId={id} dict={ts} />
          )}

          {canManage && (
            <DeactivateSupplierButton supplierId={id} dict={ts} />
          )}
        </aside>
      </div>
    </>
  );
}
