"use client";

import { useActionState, useState } from "react";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { adjustInventoryItemStock } from "@/lib/actions/inventory-corrections";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { InventoryFormState } from "@/lib/validation/inventory";

type CorrectionType = "adjustment" | "adjustment_out" | "write_off";

const TYPE_CONFIG: Record<
  CorrectionType,
  { icon: typeof TrendingUp; labelKey: "adjustIn" | "adjustOut" | "writeOff"; danger: boolean }
> = {
  adjustment:     { icon: TrendingUp,   labelKey: "adjustIn",  danger: false },
  adjustment_out: { icon: TrendingDown, labelKey: "adjustOut", danger: true  },
  write_off:      { icon: Trash2,       labelKey: "writeOff",  danger: true  },
};

export function StockCorrectionForm({
  inventoryItemId,
  unit,
  currentQuantity,
  labels,
  errors,
}: {
  inventoryItemId: string;
  unit: string;
  currentQuantity: number;
  labels: {
    title: string;
    type: string;
    adjustIn: string;
    adjustOut: string;
    writeOff: string;
    quantity: string;
    reason: string;
    reasonPlaceholder: string;
    note: string;
    notePlaceholder: string;
    save: string;
    saving: string;
    currentStock: string;
    confirmDecrease: string;
    confirmWriteOff: string;
    success: string;
  };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    adjustInventoryItemStock,
    undefined,
  );
  const [selectedType, setSelectedType] = useState<CorrectionType>("adjustment");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const needsConfirm = selectedType === "adjustment_out" || selectedType === "write_off";
    if (needsConfirm) {
      const msg =
        selectedType === "write_off" ? labels.confirmWriteOff : labels.confirmDecrease;
      if (!window.confirm(msg)) {
        e.preventDefault();
        return;
      }
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-3" data-e2e-marker="stock-correction-form">
      <h3 className="text-sm font-semibold text-text-primary">{labels.title}</h3>
      <input type="hidden" name="itemId" value={inventoryItemId} />
      <input type="hidden" name="type" value={selectedType} />

      <p className="text-xs text-text-secondary">
        {labels.currentStock}:{" "}
        <span className="font-semibold tabular-nums text-text-primary">
          {currentQuantity} {unit}
        </span>
      </p>

      {/* Type selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.entries(TYPE_CONFIG) as [CorrectionType, (typeof TYPE_CONFIG)[CorrectionType]][]).map(
          ([typeKey, cfg]) => {
            const Icon = cfg.icon;
            const label = labels[cfg.labelKey];
            const isActive = selectedType === typeKey;
            return (
              <button
                key={typeKey}
                type="button"
                onClick={() => setSelectedType(typeKey)}
                className={[
                  "flex flex-col items-center gap-1 rounded-[10px] border px-2 py-2 text-[11px] font-medium transition-colors",
                  isActive && !cfg.danger
                    ? "border-accent bg-accent/10 text-accent"
                    : isActive && cfg.danger
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-border-subtle bg-bg-base text-text-secondary hover:bg-bg-elevated",
                ].join(" ")}
                data-e2e-type={typeKey}
              >
                <Icon className="size-3.5" />
                <span>{label}</span>
              </button>
            );
          },
        )}
      </div>

      <Input
        id="correction-quantity"
        name="quantity"
        label={`${labels.quantity} (${unit})`}
        required
        inputMode="decimal"
        placeholder="1"
        error={state?.fieldErrors?.quantity ? errors[state.fieldErrors.quantity] ?? state.fieldErrors.quantity : undefined}
      />

      <Input
        id="correction-reason"
        name="reason"
        label={labels.reason}
        placeholder={labels.reasonPlaceholder}
        required
        error={state?.fieldErrors?.reason ? errors[state.fieldErrors.reason] ?? state.fieldErrors.reason : undefined}
      />

      <Input
        id="correction-note"
        name="note"
        label={labels.note}
        placeholder={labels.notePlaceholder}
      />

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      {state?.success && (
        <p className="rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {labels.success}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full"
        variant={selectedType === "write_off" ? "secondary" : "primary"}
      >
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
