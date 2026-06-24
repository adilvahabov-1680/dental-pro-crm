"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { InventoryFormState } from "@/lib/validation/inventory";
import type { Dict } from "@/i18n/az";

interface InitialValues {
  id?: string;
  name?: string;
  categoryId?: string | null;
  unit?: string;
  purchaseUnit?: string | null;
  purchaseToBaseFactor?: number;
  doseToBaseFactor?: number | null;
  minQuantity?: number;
  purchasePrice?: string; // AZN, e.g. "0.20" — already converted from gapiks
  supplierName?: string | null;
  expiresAt?: string | null; // yyyy-mm-dd
  quantity?: number;
  hasLinkedRecords?: boolean;
}

export function InventoryItemForm({
  action,
  dict,
  categories,
  initial = {},
}: {
  action: (prev: InventoryFormState | undefined, formData: FormData) => Promise<InventoryFormState>;
  dict: Dict["inventory"];
  categories: Array<{ id: string; name: string }>;
  initial?: InitialValues;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    action,
    undefined,
  );
  const isEdit = !!initial.id;
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
      {isEdit && <input type="hidden" name="id" value={initial.id} />}

      {isEdit && initial.hasLinkedRecords && (
        <p className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {f.unitChangeWarning}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            id="name"
            name="name"
            label={f.name}
            required
            defaultValue={initial.name ?? ""}
            error={err("name")}
          />
        </div>
        <Select id="categoryId" name="categoryId" label={f.category} defaultValue={initial.categoryId ?? ""}>
          <option value="">{f.categoryNone}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          id="unit"
          name="unit"
          label={f.unit}
          required
          placeholder="ədəd"
          defaultValue={initial.unit ?? ""}
          error={err("unit")}
        />

        {isEdit ? (
          <div className="space-y-1.5">
            <p className="block text-sm text-text-secondary">{f.currentQuantity}</p>
            <p className="flex h-10 items-center rounded-[10px] border border-border-subtle bg-bg-base/30 px-3 text-sm tabular-nums text-text-secondary">
              {initial.quantity} {initial.unit}
            </p>
            <p className="text-[11px] text-text-secondary">{f.quantityLocked}</p>
          </div>
        ) : (
          <Input
            id="initialQuantity"
            name="initialQuantity"
            label={f.initialQuantity}
            required
            inputMode="decimal"
            defaultValue="0"
            error={err("initialQuantity")}
          />
        )}

        <Input
          id="minQuantity"
          name="minQuantity"
          label={f.minQuantity}
          required
          inputMode="decimal"
          defaultValue={initial.minQuantity != null ? String(initial.minQuantity) : "1"}
          error={err("minQuantity")}
        />
        <Input
          id="purchasePrice"
          name="purchasePrice"
          label={f.purchasePrice}
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={initial.purchasePrice ?? ""}
        />
        <Input
          id="supplierName"
          name="supplierName"
          label={f.supplierName}
          defaultValue={initial.supplierName ?? ""}
        />
        <Input
          id="expiresAt"
          name="expiresAt"
          type="date"
          label={f.expiresAt}
          defaultValue={initial.expiresAt ?? ""}
        />
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
            defaultValue={initial.purchaseUnit ?? ""}
          />
          <div>
            <Input
              id="purchaseToBaseFactor"
              name="purchaseToBaseFactor"
              label={f.purchaseToBaseFactor}
              inputMode="decimal"
              defaultValue={initial.purchaseToBaseFactor != null ? String(initial.purchaseToBaseFactor) : "1"}
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
              defaultValue={initial.doseToBaseFactor != null ? String(initial.doseToBaseFactor) : ""}
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
          href={isEdit ? `/inventory/${initial.id}` : "/inventory"}
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
