import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { formatInvoiceNumber } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import type { DashboardInvoice } from "@/lib/dashboard";

export function FinanceOverviewPanel({
  invoices,
  labels,
}: {
  invoices: DashboardInvoice[];
  labels: { title: string; empty: string; all: string; balance: string };
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Wallet className="size-4 text-warning" /> {labels.title}
          {invoices.length > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] tabular-nums text-warning">
              {invoices.length}
            </span>
          )}
        </h2>
        <Link
          href="/finance"
          className="text-xs text-text-secondary transition-colors hover:text-accent"
        >
          {labels.all} →
        </Link>
      </div>
      {invoices.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/finance/invoices/${inv.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 transition-colors hover:bg-bg-elevated"
              >
                <span className="text-xs font-medium tabular-nums text-text-secondary">
                  {formatInvoiceNumber(inv.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {inv.patient.lastName} {inv.patient.firstName}
                </span>
                <span className="text-sm font-medium tabular-nums text-warning">
                  {formatMoney(inv.debt?.amount ?? inv.total - inv.paidAmount)}
                </span>
                <InvoiceStatusBadge status={inv.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
