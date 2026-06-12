"use client";

import { useActionState } from "react";
import { addTreatmentMaterial } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { InventoryFormState } from "@/lib/validation/inventory";

export function TreatmentMaterialsForm({
  treatmentItemId,
  items,
  labels,
  errors,
}: {
  treatmentItemId: string;
  /** материалы клиники с остатком (qty>0) */
  items: Array<{ id: string; name: string; unit: string; quantity: string }>;
  labels: { addTitle: string; item: string; itemNone: string; quantity: string; inStock: string; add: string; adding: string };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    addTreatmentMaterial,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{labels.addTitle}</h3>
      <input type="hidden" name="treatmentItemId" value={treatmentItemId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
        <Select id="inventoryItemId" name="inventoryItemId" label={labels.item} required defaultValue="">
          <option value="">{labels.itemNone}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.quantity} {i.unit} {labels.inStock}
            </option>
          ))}
        </Select>
        <Input
          id="quantity"
          name="quantity"
          label={labels.quantity}
          required
          inputMode="decimal"
          placeholder="1"
        />
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            {pending ? labels.adding : labels.add}
          </Button>
        </div>
      </div>
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
    </form>
  );
}
