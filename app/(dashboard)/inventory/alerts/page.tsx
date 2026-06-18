import Link from "next/link";
import { ArrowLeft, PackageX, TriangleAlert, AlertTriangle, ListChecks } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { formatQty, listInventoryCategories } from "@/lib/inventory";
import {
  listLowStockAlerts,
  getLowStockAlertSummary,
  type LowStockStatusFilter,
} from "@/lib/low-stock";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { LowStockAlertBadge } from "@/components/inventory/LowStockAlertBadge";

const STATUS_VALUES = ["all", "attention", "out_of_stock", "low_stock", "warning"] as const;

export default async function LowStockAlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ta = t.inventory.alerts;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const statusParam = s("status");
  const status: LowStockStatusFilter = (
    STATUS_VALUES as readonly string[]
  ).includes(statusParam ?? "")
    ? (statusParam as LowStockStatusFilter)
    : "attention";
  const q = s("q");
  const categoryId = s("category");

  const [summary, rows, categories] = await Promise.all([
    getLowStockAlertSummary(user),
    listLowStockAlerts(user, { status, q, categoryId }),
    listInventoryCategories(user),
  ]);

  return (
    <>
      <PageHeader
        title={ta.title}
        description={ta.desc}
        actions={
          <Link
            href="/inventory"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {ta.backToInventory}
          </Link>
        }
      />

      <div
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-e2e-marker="alerts-summary"
      >
        <StatCard
          title={ta.summary.outOfStock}
          value={String(summary.outOfStock)}
          icon={PackageX}
          tone={summary.outOfStock > 0 ? "danger" : "success"}
        />
        <StatCard
          title={ta.summary.lowStock}
          value={String(summary.lowStock)}
          icon={TriangleAlert}
          tone={summary.lowStock > 0 ? "warning" : "success"}
        />
        <StatCard
          title={ta.summary.warning}
          value={String(summary.warning)}
          icon={AlertTriangle}
          tone={summary.warning > 0 ? "info" : "success"}
        />
        <StatCard
          title={ta.summary.needsAttention}
          value={String(summary.needsAttention)}
          icon={ListChecks}
          tone={summary.needsAttention > 0 ? "accent" : "success"}
        />
      </div>

      <Card className="mb-6 p-4" data-e2e-marker="alerts-filter-form">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">{ta.filter.status}</label>
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="attention">{ta.filter.attention}</option>
              <option value="all">{ta.filter.all}</option>
              <option value="out_of_stock">{ta.filter.out_of_stock}</option>
              <option value="low_stock">{ta.filter.low_stock}</option>
              <option value="warning">{ta.filter.warning}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {ta.filter.searchPlaceholder}
            </label>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder={ta.filter.searchPlaceholder}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">{ta.filter.category}</label>
            <select
              name="category"
              defaultValue={categoryId ?? ""}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{ta.filter.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 rounded-[8px] border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            {ta.filter.apply}
          </button>
          <Link
            href="/inventory/alerts"
            className="inline-flex h-9 items-center rounded-[8px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            {ta.filter.reset}
          </Link>
        </form>
      </Card>

      <Card className="p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary" data-e2e-marker="alerts-empty">
            {ta.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-e2e-marker="alerts-table">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                  <th className="pb-2 pr-3 font-medium">{ta.table.material}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{ta.table.currentQty}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{ta.table.minQty}</th>
                  <th className="pb-2 pr-3 font-medium">{ta.table.status}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{ta.table.suggestedReorder}</th>
                  <th className="pb-2 pr-3 font-medium">{ta.table.supplier}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle/50 last:border-0"
                    data-e2e-marker={`alert-row-${r.id}`}
                  >
                    <td className="py-2 pr-3 text-text-primary">
                      {r.name}
                      {r.categoryName && (
                        <span className="ml-1 text-xs text-text-secondary">· {r.categoryName}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                      {`${formatQty(r.quantity)} ${r.unit}`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                      {`${formatQty(r.minQuantity)} ${r.unit}`}
                    </td>
                    <td className="py-2 pr-3">
                      <LowStockAlertBadge status={r.status} label={ta.status[r.status]} />
                    </td>
                    <td
                      className="py-2 pr-3 text-right tabular-nums text-text-primary"
                      data-e2e-marker={`alert-suggested-${r.id}`}
                    >
                      {`${formatQty(r.suggestedBaseQuantity)} ${r.unit}`}
                      {r.suggestedPurchaseUnits !== null && (
                        <span className="ml-1 text-xs text-text-secondary">
                          {`(~${r.suggestedPurchaseUnits} ${r.purchaseUnit})`}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.supplierId ? (
                        <Link
                          href={`/inventory/suppliers/${r.supplierId}`}
                          className="text-[11px] text-accent transition-opacity hover:opacity-70"
                          data-e2e-marker={`alert-supplier-${r.id}`}
                        >
                          {r.supplierName}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-text-secondary">{ta.table.noSupplier}</span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <Link
                        href={`/inventory/${r.id}`}
                        className="text-[11px] text-accent transition-opacity hover:opacity-70"
                        data-e2e-marker={`alert-go-to-item-${r.id}`}
                      >
                        {ta.table.goToItem}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-text-secondary" data-e2e-marker="alerts-auto-order-note">
        {ta.autoOrderNote}
      </p>
    </>
  );
}
