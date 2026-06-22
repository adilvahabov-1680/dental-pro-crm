import Link from "next/link";
import { Package } from "lucide-react";
import { InventoryStatusBadge } from "@/components/inventory/InventoryStatusBadge";
import { inventoryStatus, formatQty, type InventoryItemFull } from "@/lib/inventory";
import { cn, formatMoney } from "@/lib/utils";

export function InventoryItemCard({
  item,
  labels,
}: {
  item: InventoryItemFull;
  labels: { minQuantity: string };
}) {
  const status = inventoryStatus(item);
  return (
    <Link
      href={`/inventory/${item.id}`}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3 transition-colors hover:border-accent/30",
        status === "out" && "opacity-70",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          status === "normal" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning",
          status === "out" && "bg-danger/10 text-danger",
        )}
      >
        <Package className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-primary">{item.name}</p>
        <p className="text-xs text-text-secondary">
          {item.category?.name ?? "—"}
          {item.unitCost != null && ` · ${formatMoney(item.unitCost)}`}
          {item.supplier && ` · ${item.supplier.name}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-text-primary">
            {formatQty(item.quantity)} {item.unit}
          </p>
          <p className="text-[11px] tabular-nums text-text-secondary">
            {labels.minQuantity}: {formatQty(item.minQuantity)}
          </p>
        </div>
        <InventoryStatusBadge status={status} />
      </div>
    </Link>
  );
}
