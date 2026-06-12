import Link from "next/link";
import { TriangleAlert, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InventoryStatusBadge } from "@/components/inventory/InventoryStatusBadge";
import { inventoryStatus, formatQty, type InventoryItemFull } from "@/lib/inventory";

export function LowStockPanel({
  items,
  labels,
}: {
  items: InventoryItemFull[];
  labels: { title: string; empty: string; minQuantity: string };
}) {
  return (
    <Card className={items.length > 0 ? "border-warning/30 p-4" : "p-4"}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        {items.length > 0 ? (
          <TriangleAlert className="size-4 text-warning" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}
        {labels.title}
        {items.length > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] tabular-nums text-warning">
            {items.length}
          </span>
        )}
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">{labels.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link
                href={`/inventory/${item.id}`}
                className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                  {item.name}
                </span>
                <span className="text-xs tabular-nums text-text-secondary">
                  {formatQty(item.quantity)}/{formatQty(item.minQuantity)} {item.unit}
                </span>
                <InventoryStatusBadge status={inventoryStatus(item)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
