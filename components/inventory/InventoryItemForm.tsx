"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createInventoryItem } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { InventoryFormState } from "@/lib/validation/inventory";
import type { Dict } from "@/i18n/az";

export function InventoryItemForm({
  dict,
  categories,
}: {
  dict: Dict["inventory"];
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    createInventoryItem,
    undefined,
  );
  const f = dict.form;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border-subtle bg-bg-surface/80 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input id="name" name="name" label={f.name} required error={err("name")} />
        </div>
        <Select id="categoryId" name="categoryId" label={f.category} defaultValue="">
          <option value="">{f.categoryNone}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input id="unit" name="unit" label={f.unit} required placeholder="ədəd" error={err("unit")} />
        <Input
          id="initialQuantity"
          name="initialQuantity"
          label={f.initialQuantity}
          required
          inputMode="decimal"
          defaultValue="0"
          error={err("initialQuantity")}
        />
        <Input
          id="minQuantity"
          name="minQuantity"
          label={f.minQuantity}
          required
          inputMode="decimal"
          defaultValue="1"
          error={err("minQuantity")}
        />
        <Input
          id="purchasePrice"
          name="purchasePrice"
          label={f.purchasePrice}
          inputMode="decimal"
          placeholder="0.00"
        />
        <Input id="supplierName" name="supplierName" label={f.supplierName} />
        <Input id="expiresAt" name="expiresAt" type="date" label={f.expiresAt} />
      </div>

      <div className="space-y-3 rounded-xl border border-border-subtle/60 bg-bg-elevated/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {f.unitConversionSection}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="purchaseUnit"
            name="purchaseUnit"
            label={f.purchaseUnit}
            placeholder={f.purchaseUnitPlaceholder}
          />
          <div>
            <Input
              id="purchaseToBaseFactor"
              name="purchaseToBaseFactor"
              label={f.purchaseToBaseFactor}
              inputMode="decimal"
              defaultValue="1"
              error={err("purchaseToBaseFactor")}
            />
            <p className="mt-1 text-[11px] text-text-secondary">{f.purchaseToBaseFactorHint}</p>
          </div>
          <div className="sm:col-span-2">
            <Input
              id="doseToBaseFactor"
              name="doseToBaseFactor"
              label={f.doseToBaseFactor}
              inputMode="decimal"
              error={err("doseToBaseFactor")}
            />
            <p className="mt-1 text-[11px] text-text-secondary">{f.doseToBaseFactorHint}</p>
          </div>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? f.saving : f.save}
        </Button>
        <Link
          href="/inventory"
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
