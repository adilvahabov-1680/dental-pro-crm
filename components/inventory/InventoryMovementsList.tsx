import { ArrowDownToLine, ArrowUpFromLine, Trash2, SlidersHorizontal, TrendingDown } from "lucide-react";
import { MOVEMENT_TYPE_META } from "@/lib/constants";
import { formatQty, type MovementRow } from "@/lib/inventory";
import { cn, formatDate } from "@/lib/utils";

const ICONS: Record<string, typeof ArrowDownToLine> = {
  in_stock: ArrowDownToLine,
  out_stock: ArrowUpFromLine,
  adjustment: SlidersHorizontal,
  adjustment_out: TrendingDown,
  write_off: Trash2,
};

export function InventoryMovementsList({
  movements,
  unit,
  labels,
}: {
  movements: MovementRow[];
  unit: string;
  labels: { historyEmpty: string; by: string };
}) {
  if (movements.length === 0) {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
        {labels.historyEmpty}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {movements.map((m) => {
        const meta = MOVEMENT_TYPE_META[m.type];
        const Icon = ICONS[m.type] ?? SlidersHorizontal;
        const incoming = meta?.sign === 1;
        return (
          <li
            key={m.id}
            className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px]",
                  incoming ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="text-xs text-text-primary">{meta?.az ?? m.type}</span>
              <span className="text-xs tabular-nums text-text-secondary">{formatDate(m.createdAt)}</span>
              {m.reason && <span className="text-xs text-text-secondary">{m.reason}</span>}
              <span className="text-[11px] text-text-secondary/70">
                {m.performedByName} {labels.by}
              </span>
              <span
                className={cn(
                  "ml-auto text-sm font-semibold tabular-nums",
                  incoming ? "text-success" : "text-warning",
                )}
              >
                {incoming ? "+" : "−"}
                {formatQty(m.quantity)} {unit}
              </span>
            </div>
            {m.note && (
              <p className="mt-1 pl-9 text-[11px] italic text-text-secondary/80">{m.note}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
