import { Package } from "lucide-react";
import type { TreatmentMaterialRow } from "@/lib/inventory";
import { formatDate, formatMoney } from "@/lib/utils";

export function TreatmentMaterialsList({
  materials,
  labels,
}: {
  materials: TreatmentMaterialRow[];
  labels: { empty: string; cost: string };
}) {
  if (materials.length === 0) {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
        {labels.empty}
      </p>
    );
  }
  const totalCost = materials.reduce(
    (s, m) => s + Math.round(m.unitCost * m.quantity),
    0,
  );
  return (
    <div>
      <ul className="space-y-1.5">
        {materials.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
          >
            <Package className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-xs text-text-primary">{m.name}</span>
            <span className="text-xs tabular-nums text-text-secondary">
              {m.quantity.toLocaleString("az-AZ", { maximumFractionDigits: 3 })} {m.unit}
            </span>
            <span className="text-xs tabular-nums text-text-secondary">{formatDate(m.createdAt)}</span>
            {m.unitCost > 0 && (
              <span className="text-xs font-medium tabular-nums text-text-primary">
                {formatMoney(Math.round(m.unitCost * m.quantity))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {totalCost > 0 && (
        <p className="mt-2 text-right text-xs text-text-secondary">
          {labels.cost}:{" "}
          <span className="font-semibold tabular-nums text-text-primary">
            {formatMoney(totalCost)}
          </span>
        </p>
      )}
    </div>
  );
}
