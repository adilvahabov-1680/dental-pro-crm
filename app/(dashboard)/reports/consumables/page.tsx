import Link from "next/link";
import {
  ArrowLeft,
  TriangleAlert,
  Package,
  Activity,
  ClipboardList,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/utils";
import { listClinicDoctors } from "@/lib/patients";
import { listServicesWithPrice } from "@/lib/treatments";
import {
  getConsumableCostSummary,
  getConsumableCostByInventoryItem,
  getConsumableCostByService,
  getConsumableCostByDoctor,
  getRecentConsumableUsages,
  type ConsumableCostFilters,
} from "@/lib/consumable-cost-reports";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";

export default async function ConsumableCostReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const tr = t.reports.consumables;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const fromStr = s("from");
  const toStr = s("to");
  const doctorId = s("doctor") || undefined;
  const serviceId = s("service") || undefined;

  const filters: ConsumableCostFilters = {
    dateFrom: fromStr ? new Date(fromStr + "T00:00:00") : undefined,
    dateTo: toStr ? new Date(toStr + "T23:59:59") : undefined,
    doctorId,
    serviceId,
  };

  const [summary, byItem, byService, byDoctor, recent, doctors, services] =
    await Promise.all([
      getConsumableCostSummary(user, filters),
      getConsumableCostByInventoryItem(user, filters),
      getConsumableCostByService(user, filters),
      getConsumableCostByDoctor(user, filters),
      getRecentConsumableUsages(user, filters, 50),
      listClinicDoctors(user),
      listServicesWithPrice(user),
    ]);

  return (
    <>
      <PageHeader
        title={tr.title}
        description={tr.desc}
        actions={
          <Link
            href="/inventory"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {tr.backToInventory}
          </Link>
        }
      />

      {/* Filter form */}
      <Card className="mb-6 p-4" data-e2e-marker="report-filter-form">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {tr.filter.from}
            </label>
            <input
              type="date"
              name="from"
              defaultValue={fromStr ?? ""}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {tr.filter.to}
            </label>
            <input
              type="date"
              name="to"
              defaultValue={toStr ?? ""}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {tr.filter.doctor}
            </label>
            <select
              name="doctor"
              defaultValue={doctorId ?? ""}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{tr.filter.allDoctors}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {tr.filter.service}
            </label>
            <select
              name="service"
              defaultValue={serviceId ?? ""}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{tr.filter.allServices}</option>
              {services.map((sv) => (
                <option key={sv.id} value={sv.id}>
                  {sv.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 rounded-[8px] border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            {tr.filter.apply}
          </button>
          <Link
            href="/reports/consumables"
            className="inline-flex h-9 items-center rounded-[8px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            {tr.filter.reset}
          </Link>
        </form>
      </Card>

      {/* Summary cards */}
      <div
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-e2e-marker="consumable-report-summary"
      >
        <StatCard
          title={tr.summary.totalCost}
          value={formatMoney(summary.totalCostGapik)}
          icon={Package}
          tone="accent"
        />
        <StatCard
          title={tr.summary.usageRows}
          value={String(summary.totalUsageRows)}
          icon={Activity}
          tone="success"
        />
        <StatCard
          title={tr.summary.treatments}
          value={String(summary.totalTreatments)}
          icon={ClipboardList}
          tone="info"
        />
        <StatCard
          title={tr.summary.missingCost}
          value={String(summary.missingUnitCostCount)}
          icon={TriangleAlert}
          tone={summary.missingUnitCostCount > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By inventory item */}
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            {tr.byItem.title}
          </h2>
          {byItem.length === 0 ? (
            <p className="text-sm text-text-secondary">{tr.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-e2e-marker="by-item-table"
              >
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                    <th className="pb-2 pr-3 font-medium">{tr.byItem.material}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byItem.qty}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byItem.unitCost}</th>
                    <th className="pb-2 font-medium text-right">{tr.byItem.totalCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {byItem.map((r) => (
                    <tr
                      key={r.inventoryItemId}
                      className="border-b border-border-subtle/50 last:border-0"
                    >
                      <td className="py-2 pr-3 text-text-primary">{r.itemName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                        {r.totalBaseQuantity} {r.baseUnit}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.unitCostGapik !== null ? (
                          formatMoney(r.unitCostGapik)
                        ) : (
                          <span className="text-xs text-warning" data-e2e-marker="missing-cost">
                            {tr.missingCost}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                        {r.unitCostGapik !== null ? formatMoney(r.totalCostGapik) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* By service */}
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            {tr.byService.title}
          </h2>
          {byService.length === 0 ? (
            <p className="text-sm text-text-secondary">{tr.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-e2e-marker="by-service-table"
              >
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                    <th className="pb-2 pr-3 font-medium">{tr.byService.service}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byService.treatments}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byService.totalCost}</th>
                    <th className="pb-2 font-medium text-right">{tr.byService.avgCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {byService.map((r) => (
                    <tr
                      key={r.serviceId}
                      className="border-b border-border-subtle/50 last:border-0"
                    >
                      <td className="py-2 pr-3 text-text-primary">{r.serviceName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                        {r.treatmentCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">
                        {formatMoney(r.totalCostGapik)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatMoney(r.avgCostGapik)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* By doctor */}
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            {tr.byDoctor.title}
          </h2>
          {byDoctor.length === 0 ? (
            <p className="text-sm text-text-secondary">{tr.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-e2e-marker="by-doctor-table"
              >
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                    <th className="pb-2 pr-3 font-medium">{tr.byDoctor.doctor}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byDoctor.treatments}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{tr.byDoctor.totalCost}</th>
                    <th className="pb-2 font-medium text-right">{tr.byDoctor.avgCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {byDoctor.map((r) => (
                    <tr
                      key={r.doctorId}
                      className="border-b border-border-subtle/50 last:border-0"
                    >
                      <td className="py-2 pr-3 text-text-primary">{r.doctorName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                        {r.treatmentCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">
                        {formatMoney(r.totalCostGapik)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {formatMoney(r.avgCostGapik)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Recent usage details */}
      <Card className="mt-6 p-4">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">
          {tr.recent.title}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-text-secondary">{tr.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              data-e2e-marker="recent-usage-table"
            >
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                  <th className="pb-2 pr-3 font-medium">{tr.recent.date}</th>
                  <th className="pb-2 pr-3 font-medium">{tr.recent.patient}</th>
                  <th className="pb-2 pr-3 font-medium">{tr.recent.doctor}</th>
                  <th className="pb-2 pr-3 font-medium">{tr.recent.service}</th>
                  <th className="pb-2 pr-3 font-medium">{tr.recent.material}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{tr.recent.qty}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{tr.recent.unitCost}</th>
                  <th className="pb-2 pr-3 font-medium text-right">{tr.recent.lineCost}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle/50 last:border-0"
                    data-e2e-marker={`recent-usage-row-${r.id}`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="py-2 pr-3 text-text-primary">{r.patientName}</td>
                    <td className="py-2 pr-3 text-text-secondary">{r.doctorName}</td>
                    <td className="py-2 pr-3 text-text-secondary">{r.serviceName}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.itemName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                      {r.baseQuantity} {r.baseUnit}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.unitCostGapik !== null ? (
                        formatMoney(r.unitCostGapik)
                      ) : (
                        <span className="text-xs text-warning" data-e2e-marker="missing-cost">
                          {tr.missingCost}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">
                      {r.unitCostGapik !== null ? formatMoney(r.lineCostGapik) : "—"}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <Link
                        href={`/treatments/${r.treatmentItemId}/consumables`}
                        className="text-[11px] text-accent transition-opacity hover:opacity-70"
                        data-e2e-marker={`report-go-to-treatment-${r.id}`}
                      >
                        {tr.recent.goToTreatment}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
