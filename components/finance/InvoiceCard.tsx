import Link from "next/link";
import { Receipt, User } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { formatInvoiceNumber } from "@/lib/constants";
import type { InvoiceListItem } from "@/lib/finance";
import { cn, formatDate, formatMoney } from "@/lib/utils";

export function InvoiceCard({
  invoice: inv,
  labels,
  showPatient = true,
}: {
  invoice: InvoiceListItem;
  labels: { balance: string; paidAmount: string };
  showPatient?: boolean;
}) {
  const balance = inv.total - inv.paidAmount;
  const cancelled = inv.status === "cancelled";
  return (
    <Link
      href={`/finance/invoices/${inv.id}`}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3 transition-colors hover:border-accent/30",
        cancelled && "opacity-60",
      )}
    >
      <div className="flex w-28 shrink-0 flex-col items-center rounded-xl bg-bg-elevated/70 px-2 py-1.5">
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-accent">
          <Receipt className="size-3.5" /> {formatInvoiceNumber(inv.number)}
        </span>
        <span className="text-[10px] tabular-nums text-text-secondary">
          {formatDate(inv.createdAt)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {showPatient && (
          <p className="flex items-center gap-1.5 font-medium text-text-primary">
            <User className="size-3.5 text-text-secondary" /> {inv.patient.lastName}{" "}
            {inv.patient.firstName}
          </p>
        )}
        <p className="mt-0.5 text-xs text-text-secondary">
          {inv.doctor?.user.fullName ?? "—"}
          {" · "}
          {labels.paidAmount}: <span className="tabular-nums">{formatMoney(inv.paidAmount)}</span>
          {balance > 0 && !cancelled && (
            <>
              {" · "}
              <span className="font-medium text-warning">
                {labels.balance}: <span className="tabular-nums">{formatMoney(balance)}</span>
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold tabular-nums text-text-primary">
          {formatMoney(inv.total)}
        </span>
        <InvoiceStatusBadge status={inv.status} />
      </div>
    </Link>
  );
}
