"use client";

import { useActionState, useState } from "react";
import { createConsumableTemplate } from "@/lib/actions/service-consumables";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ServiceConsumableFormState } from "@/lib/validation/service-consumables";
import type { ConsumableItemOption } from "@/lib/service-consumables";
import type { Dict } from "@/i18n/az";

export function ServiceConsumableAddForm({
  serviceId,
  items,
  dict,
}: {
  serviceId: string;
  items: ConsumableItemOption[];
  dict: Dict["settings"];
}) {
  const cp = dict.services.consumablesPage;
  const [state, formAction, pending] = useActionState<
    ServiceConsumableFormState | undefined,
    FormData
  >(createConsumableTemplate, undefined);

  const [selectedId, setSelectedId] = useState("");
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4"
      data-e2e-marker="consumable-add-form"
    >
      <input type="hidden" name="serviceId" value={serviceId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select
            id="inventoryItemId"
            name="inventoryItemId"
            label={cp.material}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            error={err("inventoryItemId")}
          >
            <option value="">—</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit}
                {i.doseToBaseFactor ? ` · 1 doza = ${i.doseToBaseFactor} ${i.unit}` : ""})
                · {i.currentQty} {cp.stockQty}
              </option>
            ))}
          </Select>
        </div>

        <Input
          id="quantity"
          name="quantity"
          label={cp.qty}
          required
          inputMode="decimal"
          defaultValue="1"
          error={err("quantity")}
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">{cp.unit}</label>
          <select
            name="unit"
            defaultValue={selectedItem?.unit ?? ""}
            key={selectedItem?.id ?? "empty"}
            className="h-10 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            {selectedItem ? (
              <>
                <option value={selectedItem.unit}>{selectedItem.unit}</option>
                {selectedItem.doseToBaseFactor !== null && (
                  <option value="dose">
                    {cp.unitDose} (1 doza = {selectedItem.doseToBaseFactor} {selectedItem.unit})
                  </option>
                )}
              </>
            ) : (
              <option value="">—</option>
            )}
          </select>
          {err("unit") && <p className="mt-1 text-xs text-danger">{err("unit")}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isRequired"
            value="on"
            defaultChecked
            className="size-4 rounded border-border-subtle accent-accent"
          />
          {cp.required}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allowOverride"
            value="on"
            defaultChecked
            className="size-4 rounded border-border-subtle accent-accent"
          />
          {cp.override}
        </label>
      </div>

      <Input
        id="note"
        name="note"
        label={cp.note}
        placeholder={cp.notePlaceholder}
      />

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
      {state?.saved && (
        <p className="text-sm text-success">{dict.saved}</p>
      )}

      <Button type="submit" disabled={pending || !selectedId}>
        {pending ? cp.adding : cp.add}
      </Button>
    </form>
  );
}
