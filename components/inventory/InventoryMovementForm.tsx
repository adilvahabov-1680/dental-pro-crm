"use client";

import { useActionState } from "react";
import { addInventoryMovement } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { InventoryFormState } from "@/lib/validation/inventory";

export function InventoryMovementForm({
  inventoryItemId,
  unit,
  typeOptions,
  labels,
  errors,
}: {
  inventoryItemId: string;
  unit: string;
  typeOptions: Array<{ value: string; label: string }>;
  labels: { title: string; type: string; quantity: string; reason: string; save: string; saving: string };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    addInventoryMovement,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{labels.title}</h3>
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <div className="grid grid-cols-2 gap-3">
        <Select id="type" name="type" label={labels.type} defaultValue="in_stock">
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          id="quantity"
          name="quantity"
          label={`${labels.quantity} (${unit})`}
          required
          inputMode="decimal"
          placeholder="1"
        />
        <div className="col-span-2">
          <Input id="reason" name="reason" label={labels.reason} />
        </div>
      </div>
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
