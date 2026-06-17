import Link from "next/link";
import { Package, TriangleAlert, PackageX, Activity, Plus, Building2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  listInventoryItems,
  listLowStockItems,
  listInventoryCategories,
  inventorySummary,
  type InventoryFilters,
} from "@/lib/inventory";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { InventoryFilterBar } from "@/components/inventory/InventoryFilterBar";
import { InventoryItemsList } from "@/components/inventory/InventoryItemsList";
import { LowStockPanel } from "@/components/inventory/LowStockPanel";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ti = t.inventory;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filters: InventoryFilters = {
    q: s("q"),
    categoryId: s("category"),
    low: s("low") === "1",
  };
  const canManage = hasPermission(user, "inventory.manage");

  const [summary, items, lowItems, categories] = await Promise.all([
    inventorySummary(user),
    listInventoryItems(user, filters),
    listLowStockItems(user),
    listInventoryCategories(user),
  ]);

  return (
    <>
      <PageHeader
        title={t.modules.inventory.title}
        description={t.modules.inventory.desc}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/inventory/suppliers"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface/80 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface"
            >
              <Building2 className="size-4" /> {t.suppliers.title}
            </Link>
            {canManage && (
              <Link
                href="/inventory/new"
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" /> {ti.new}
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={ti.summary.total} value={String(summary.total)} icon={Package} tone="accent" />
        <StatCard
          title={ti.summary.low}
          value={String(summary.low)}
          icon={TriangleAlert}
          tone={summary.low > 0 ? "warning" : "success"}
        />
        <StatCard
          title={ti.summary.out}
          value={String(summary.out)}
          icon={PackageX}
          tone={summary.out > 0 ? "danger" : "success"}
        />
        <StatCard
          title={ti.summary.monthUsage}
          value={`${summary.monthUsage} ${ti.summary.movements}`}
          icon={Activity}
          tone="info"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div>
          <InventoryFilterBar
            categories={categories}
            labels={{ ...ti.filters }}
          />
          <InventoryItemsList
            items={items}
            labels={{ minQuantity: ti.item.minQuantity }}
            empty={ti.empty}
          />
          {items.length > 0 && (
            <p className="mt-3 text-sm tabular-nums text-text-secondary">
              {items.length} {ti.total}
            </p>
          )}
        </div>
        <LowStockPanel
          items={lowItems}
          labels={{
            title: ti.lowStock.title,
            empty: ti.lowStock.empty,
            minQuantity: ti.item.minQuantity,
          }}
        />
      </div>
    </>
  );
}
