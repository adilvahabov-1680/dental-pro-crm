import Link from "next/link";
import { Building2, Calendar } from "lucide-react";
import type { SupplierOrderFull } from "@/lib/supplier-orders";
import type { Dict } from "@/i18n/az";

const statusClass: Record<string, string> = {
  draft: "bg-warning/15 text-warning",
  sent: "bg-accent/15 text-accent",
  received: "bg-success/15 text-success",
  cancelled: "bg-danger/15 text-danger",
};

export function OrderDetailCard({
  order,
  dict,
}: {
  order: SupplierOrderFull;
  dict: Dict["supplierOrders"];
}) {
  const statusLabel = dict.statuses[order.status as keyof typeof dict.statuses];
  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("az-AZ") : "—";

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{order.number}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[order.status] ?? ""}`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <Building2 className="mt-0.5 size-4 shrink-0 text-text-secondary/60" />
          <div>
            <dt className="text-xs text-text-secondary">{dict.supplier}</dt>
            <dd>
              <Link
                href={`/inventory/suppliers/${order.supplier.id}`}
                className="font-medium text-accent hover:underline"
              >
                {order.supplier.name}
              </Link>
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 size-4 shrink-0 text-text-secondary/60" />
          <div>
            <dt className="text-xs text-text-secondary">{dict.createdAt}</dt>
            <dd className="text-text-primary">{fmt(order.createdAt)}</dd>
          </div>
        </div>

        {order.sentAt && (
          <div className="pl-6">
            <dt className="text-xs text-text-secondary">{dict.sentAt}</dt>
            <dd className="text-text-primary">{fmt(order.sentAt)}</dd>
          </div>
        )}

        {order.receivedAt && (
          <div className="pl-6">
            <dt className="text-xs text-text-secondary">{dict.receivedAt}</dt>
            <dd className="text-text-primary">{fmt(order.receivedAt)}</dd>
          </div>
        )}
      </dl>

      {order.totalCost > 0 && (
        <div className="rounded-[10px] bg-bg-base/50 px-3 py-2">
          <span className="text-xs text-text-secondary">{dict.totalCost}:</span>
          <span className="ml-2 font-semibold tabular-nums text-text-primary">
            {(order.totalCost / 100).toFixed(2)} AZN
          </span>
        </div>
      )}

      {order.notes && (
        <p className="rounded-[10px] bg-bg-base/50 px-3 py-2 text-sm text-text-secondary">
          {order.notes}
        </p>
      )}
    </div>
  );
}
