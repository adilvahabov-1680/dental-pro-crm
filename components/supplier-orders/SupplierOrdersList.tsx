import Link from "next/link";
import { ChevronRight, ShoppingCart } from "lucide-react";
import type { SupplierOrderRow } from "@/lib/supplier-orders";
import type { Dict } from "@/i18n/az";

const statusClass: Record<string, string> = {
  draft: "bg-warning/15 text-warning",
  approved: "bg-info/15 text-info",
  sent: "bg-accent/15 text-accent",
  received: "bg-success/15 text-success",
  cancelled: "bg-danger/15 text-danger",
};

export function SupplierOrdersList({
  orders,
  dict,
}: {
  orders: SupplierOrderRow[];
  dict: Dict["supplierOrders"];
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface/60 px-6 py-12 text-center">
        <ShoppingCart className="mx-auto mb-3 size-10 text-text-secondary/40" />
        <p className="font-medium text-text-primary">{dict.empty.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{dict.empty.desc}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-surface/80">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`/inventory/supplier-orders/${o.id}`}
            className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-bg-surface"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-medium text-text-primary">{o.number}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[o.status] ?? "bg-border-subtle text-text-secondary"}`}
                >
                  {dict.statuses[o.status as keyof typeof dict.statuses]}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-text-secondary">{o.supplier.name}</p>
            </div>
            <div className="ml-4 flex items-center gap-4 shrink-0">
              <span className="tabular-nums text-sm text-text-secondary">
                {(o.totalCost / 100).toFixed(2)} AZN
              </span>
              <ChevronRight className="size-4 text-text-secondary/50" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
