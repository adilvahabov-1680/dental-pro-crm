import Link from "next/link";
import { ArrowLeft, PackageX, TriangleAlert, AlertTriangle, ListChecks } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listInventoryCategories } from "@/lib/inventory";
import {
  listLowStockAlerts,
  getLowStockAlertSummary,
  type LowStockStatusFilter,
} from "@/lib/low-stock";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { ReorderDraftForm } from "@/components/inventory/ReorderDraftForm";

const STATUS_VALUES = ["all", "attention", "out_of_stock", "low_stock", "warning"] as const;

export default async function LowStockAlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("inventory.view");
  const canManage = hasPermission(user, "inventory.manage");
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
          <ReorderDraftForm rows={rows} canManage={canManage} labels={ta} />
        )}
      </Card>

      <p className="mt-3 text-xs text-text-secondary" data-e2e-marker="alerts-auto-order-note">
        {ta.autoOrderNote}
      </p>
    </>
  );
}
