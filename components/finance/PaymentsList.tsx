import { PaymentMethodBadge } from "@/components/finance/PaymentMethodBadge";
import { formatDate, formatMoney } from "@/lib/utils";

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  paidAt: Date;
  notes: string | null;
  receivedByName?: string;
  invoiceNumber?: string;
}

export function PaymentsList({
  payments,
  labels,
}: {
  payments: PaymentRow[];
  labels: { historyEmpty: string; received: string };
}) {
  if (payments.length === 0) {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
        {labels.historyEmpty}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {payments.map((p) => (
        <li
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
        >
          <span className="text-xs tabular-nums text-text-secondary">{formatDate(p.paidAt)}</span>
          {p.invoiceNumber && (
            <span className="text-xs tabular-nums text-accent">{p.invoiceNumber}</span>
          )}
          <PaymentMethodBadge method={p.method} />
          {p.receivedByName && (
            <span className="text-[11px] text-text-secondary/70">
              {p.receivedByName} {labels.received}
            </span>
          )}
          {p.notes && <span className="text-xs text-text-secondary">{p.notes}</span>}
          <span className="ml-auto text-sm font-semibold tabular-nums text-success">
            +{formatMoney(p.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
