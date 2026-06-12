import { formatMoney } from "@/lib/utils";

interface Item {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export function InvoiceItemsList({
  items,
  totals,
  labels,
}: {
  items: Item[];
  totals: { subtotal: number; discount: number; total: number; paidAmount: number };
  labels: { subtotal: string; discount: string; total: string; paidAmount: string; balance: string };
}) {
  const balance = totals.total - totals.paidAmount;
  return (
    <div>
      <ul className="divide-y divide-border-subtle/60">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 text-text-primary">{it.description}</span>
            {it.qty > 1 && (
              <span className="tabular-nums text-text-secondary">
                {it.qty} × {formatMoney(it.unitPrice)}
              </span>
            )}
            <span className="font-medium tabular-nums text-text-primary">
              {formatMoney(it.total)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-1 border-t border-border-subtle pt-3 text-sm">
        <p className="flex justify-between text-text-secondary">
          <span>{labels.subtotal}</span>
          <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
        </p>
        {totals.discount > 0 && (
          <p className="flex justify-between text-text-secondary">
            <span>{labels.discount}</span>
            <span className="tabular-nums">−{formatMoney(totals.discount)}</span>
          </p>
        )}
        <p className="flex justify-between text-base font-semibold text-text-primary">
          <span>{labels.total}</span>
          <span className="tabular-nums">{formatMoney(totals.total)}</span>
        </p>
        <p className="flex justify-between text-text-secondary">
          <span>{labels.paidAmount}</span>
          <span className="tabular-nums text-success">{formatMoney(totals.paidAmount)}</span>
        </p>
        <p className="flex justify-between font-medium">
          <span className={balance > 0 ? "text-warning" : "text-text-secondary"}>
            {labels.balance}
          </span>
          <span className={`tabular-nums ${balance > 0 ? "text-warning" : "text-success"}`}>
            {formatMoney(balance)}
          </span>
        </p>
      </div>
    </div>
  );
}
