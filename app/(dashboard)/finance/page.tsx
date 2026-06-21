import Link from "next/link";
import { Receipt, Wallet, TriangleAlert, CalendarCheck, FileX, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listInvoices, financeSummary, type FinanceFilters } from "@/lib/finance";
import { listClinicDoctors } from "@/lib/patients";
import { INVOICE_STATUS_META } from "@/lib/constants";
import { INVOICE_STATUSES } from "@/lib/validation/finance";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/dashboard/StatCard";
import { InvoiceCard } from "@/components/finance/InvoiceCard";
import { FinanceFilterBar } from "@/components/finance/FinanceFilterBar";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("finance.view");
  const t = getDict(user.locale);
  const tf = t.finance;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filters: FinanceFilters = {
    q: s("q"),
    status: INVOICE_STATUSES.includes(s("status") as never)
      ? (s("status") as FinanceFilters["status"])
      : undefined,
    doctorId: s("doctor"),
  };

  const canManage = hasPermission(user, "finance.manage");
  const showDoctorFilter = user.role !== "doctor" && user.role !== "assistant";
  const [summary, invoices, doctors] = await Promise.all([
    financeSummary(user),
    listInvoices(user, filters),
    showDoctorFilter ? listClinicDoctors(user) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={t.modules.finance.title}
        description={t.modules.finance.desc}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/finance/debts"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <TriangleAlert className="size-4" /> {tf.debts.viewAll}
            </Link>
            {canManage && (
              <Link
                href="/finance/invoices/new"
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" /> {tf.newInvoice}
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={tf.summary.invoiced}
          value={formatMoney(summary.invoiced)}
          icon={Receipt}
          tone="accent"
        />
        <StatCard
          title={tf.summary.paid}
          value={formatMoney(summary.paid)}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          title={tf.summary.debt}
          value={formatMoney(summary.debt)}
          icon={TriangleAlert}
          tone={summary.debt > 0 ? "warning" : "success"}
        />
        <StatCard
          title={tf.summary.monthPayments}
          value={formatMoney(summary.monthPayments)}
          icon={CalendarCheck}
          tone="info"
        />
      </div>

      <FinanceFilterBar
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        showDoctorFilter={showDoctorFilter}
        statusOptions={INVOICE_STATUSES.map((v) => ({
          value: v,
          label: INVOICE_STATUS_META[v].az,
        }))}
        labels={{ ...tf.filters }}
      />

      {invoices.length === 0 ? (
        <Card>
          <EmptyState icon={FileX} title={tf.empty.title} description={tf.empty.desc} />
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                labels={{ balance: tf.invoice.balance, paidAmount: tf.invoice.paidAmount }}
              />
            ))}
          </div>
          <p className="mt-3 text-sm tabular-nums text-text-secondary">
            {invoices.length} {tf.total}
          </p>
        </>
      )}
    </>
  );
}
