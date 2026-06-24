import Link from "next/link";
import { ArrowLeft, Users, ClipboardList, Wallet, Banknote, Package, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/utils";
import { listClinicDoctors } from "@/lib/patients";
import {
  getDoctorDailySummary,
  getDoctorDailyTreatments,
  getDoctorDailyConsumables,
  todayDateStr,
  type DoctorDailyFilters,
} from "@/lib/doctor-daily-report";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";

export default async function DoctorDailyReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const tr = t.reports.dailyDoctor;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const canViewFinance = hasPermission(user, "finance.view");
  const canViewConsumables = hasPermission(user, "inventory.view");
  const showDoctorFilter = user.role !== "doctor" && user.role !== "assistant";

  const dateStr = s("date") || todayDateStr();
  const dateFrom = new Date(dateStr + "T00:00:00");
  const dateTo = new Date(dateStr + "T23:59:59.999");

  // scope: doctor — только себя, assistant — только прикреплённого врача,
  // owner/admin — фильтр по врачу (или вся клиника, если не выбран)
  let doctorId: string | undefined;
  let blockedNoAssignedDoctor = false;
  if (user.role === "doctor") {
    doctorId = user.doctorId ?? undefined;
  } else if (user.role === "assistant") {
    if (!user.assignedDoctorId) blockedNoAssignedDoctor = true;
    doctorId = user.assignedDoctorId ?? undefined;
  } else {
    doctorId = s("doctor") || undefined;
  }

  const filters: DoctorDailyFilters = { dateFrom, dateTo, doctorId };
  const perms = { canViewFinance, canViewConsumables };

  const [summary, treatments, materials, doctors] = blockedNoAssignedDoctor
    ? [
        { patientsCount: 0, treatmentsCount: 0, revenueGapik: 0, consumablesCostGapik: 0, profitGapik: null, paymentsGapik: null },
        [],
        [],
        [],
      ]
    : await Promise.all([
        getDoctorDailySummary(user, filters, perms),
        getDoctorDailyTreatments(user, filters, perms),
        canViewConsumables ? getDoctorDailyConsumables(user, filters) : Promise.resolve([]),
        showDoctorFilter ? listClinicDoctors(user) : Promise.resolve([]),
      ]);

  const detailsHref = `/reports/consumables?from=${dateStr}&to=${dateStr}${doctorId ? `&doctor=${doctorId}` : ""}`;

  return (
    <>
      <PageHeader
        title={tr.title}
        description={tr.desc}
        actions={
          <Link
            href="/treatments"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {tr.backToTreatments}
          </Link>
        }
      />

      <Card className="mb-6 p-4" data-e2e-marker="daily-report-filter-form">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">{tr.filter.date}</label>
            <input
              type="date"
              name="date"
              defaultValue={dateStr}
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          {showDoctorFilter && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">{tr.filter.doctor}</label>
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
          )}
          <button
            type="submit"
            className="h-9 rounded-[8px] border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            {tr.filter.apply}
          </button>
          <Link
            href="/reports/daily-doctor"
            className="inline-flex h-9 items-center rounded-[8px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            {tr.filter.today}
          </Link>
        </form>
      </Card>

      {blockedNoAssignedDoctor ? (
        <Card className="p-6 text-center text-sm text-text-secondary">{tr.noAssignedDoctor}</Card>
      ) : (
        <>
          <div
            className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
            data-e2e-marker="daily-report-summary"
          >
            <StatCard title={tr.summary.patients} value={String(summary.patientsCount)} icon={Users} tone="accent" />
            <StatCard
              title={tr.summary.treatments}
              value={String(summary.treatmentsCount)}
              icon={ClipboardList}
              tone="info"
            />
            {canViewFinance && (
              <StatCard title={tr.summary.revenue} value={formatMoney(summary.revenueGapik)} icon={Wallet} tone="success" />
            )}
            {canViewConsumables && (
              <StatCard
                title={tr.summary.consumablesCost}
                value={formatMoney(summary.consumablesCostGapik)}
                icon={Package}
                tone="warning"
              />
            )}
            {summary.profitGapik !== null && (
              <StatCard
                title={tr.summary.profit}
                value={formatMoney(summary.profitGapik)}
                hint={tr.summary.profitHint}
                icon={TrendingUp}
                tone={summary.profitGapik >= 0 ? "success" : "danger"}
              />
            )}
            {summary.paymentsGapik !== null && (
              <StatCard
                title={tr.summary.payments}
                value={formatMoney(summary.paymentsGapik)}
                hint={tr.summary.paymentsHint}
                icon={Banknote}
                tone="accent"
              />
            )}
          </div>

          <Card className="p-4" data-e2e-marker="daily-report-treatments">
            <h2 className="mb-4 text-sm font-semibold text-text-primary">{tr.table.title}</h2>
            {treatments.length === 0 ? (
              <p className="text-sm text-text-secondary">{tr.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-e2e-marker="daily-report-treatments-table">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                      <th className="pb-2 pr-3 font-medium">{tr.table.time}</th>
                      <th className="pb-2 pr-3 font-medium">{tr.table.patient}</th>
                      {showDoctorFilter && <th className="pb-2 pr-3 font-medium">{tr.table.doctor}</th>}
                      <th className="pb-2 pr-3 font-medium">{tr.table.service}</th>
                      {canViewFinance && (
                        <>
                          <th className="pb-2 pr-3 font-medium text-right">{tr.table.charged}</th>
                          <th className="pb-2 pr-3 font-medium">{tr.table.invoiceStatus}</th>
                        </>
                      )}
                      {canViewConsumables && (
                        <>
                          <th className="pb-2 pr-3 font-medium">{tr.table.consumables}</th>
                          <th className="pb-2 font-medium text-right">{tr.table.consumablesCost}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {treatments.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border-subtle/50 last:border-0"
                        data-e2e-marker={`daily-report-row-${row.id}`}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">
                          {formatDate(row.performedAt)}
                        </td>
                        <td className="py-2 pr-3 text-text-primary">{row.patientName}</td>
                        {showDoctorFilter && <td className="py-2 pr-3 text-text-secondary">{row.doctorName}</td>}
                        <td className="py-2 pr-3 text-text-secondary">{row.serviceName}</td>
                        {canViewFinance && (
                          <>
                            <td className="py-2 pr-3 text-right tabular-nums font-medium text-text-primary">
                              {formatMoney(row.chargedGapik)}
                            </td>
                            <td className="py-2 pr-3 text-text-secondary">
                              {row.invoice ? (
                                tr.invoiceStatus[row.invoice.status as keyof typeof tr.invoiceStatus] ?? row.invoice.status
                              ) : (
                                <span className="text-xs text-text-secondary/70">{tr.table.notInvoiced}</span>
                              )}
                            </td>
                          </>
                        )}
                        {canViewConsumables && (
                          <>
                            <td className="py-2 pr-3 text-text-secondary">
                              {row.consumables.length > 0
                                ? row.consumables.map((c) => `${c.itemName} (${c.baseQuantity} ${c.baseUnit})`).join(", ")
                                : tr.table.noConsumables}
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                              {row.consumablesCostGapik > 0 ? formatMoney(row.consumablesCostGapik) : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canViewConsumables && (
            <Card className="mt-6 p-4" data-e2e-marker="daily-report-materials">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-text-primary">{tr.materials.title}</h2>
                <Link
                  href={detailsHref}
                  className="text-xs text-accent transition-opacity hover:opacity-70"
                  data-e2e-marker="daily-report-materials-details-link"
                >
                  {tr.materials.detailsLink}
                </Link>
              </div>
              {materials.length === 0 ? (
                <p className="text-sm text-text-secondary">{tr.empty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-e2e-marker="daily-report-materials-table">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                        <th className="pb-2 pr-3 font-medium">{tr.materials.item}</th>
                        <th className="pb-2 pr-3 font-medium text-right">{tr.materials.qty}</th>
                        <th className="pb-2 pr-3 font-medium text-right">{tr.materials.unitCost}</th>
                        <th className="pb-2 font-medium text-right">{tr.materials.totalCost}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m) => (
                        <tr key={m.inventoryItemId} className="border-b border-border-subtle/50 last:border-0">
                          <td className="py-2 pr-3 text-text-primary">{m.itemName}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                            {m.totalBaseQuantity} {m.baseUnit}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {m.unitCostGapik !== null ? formatMoney(m.unitCostGapik) : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                            {m.unitCostGapik !== null ? formatMoney(m.totalCostGapik) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
