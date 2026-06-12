"use client";

import { useActionState } from "react";
import { createService } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { SettingsFormState } from "@/lib/validation/settings";
import type { Dict } from "@/i18n/az";

export function ServiceCreateForm({
  dict,
  categories,
}: {
  dict: Dict["settings"];
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    createService,
    undefined,
  );
  const f = dict.services.form;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input id="svc-name" name="name" label={f.name} required error={err("name")} />
        </div>
        <Select id="svc-category" name="categoryId" label={f.category} defaultValue="">
          <option value="">{f.categoryNone}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          id="svc-duration"
          name="durationMin"
          label={f.duration}
          inputMode="numeric"
          error={err("durationMin")}
        />
        <div>
          <Input
            id="svc-price"
            name="price"
            label={f.price}
            inputMode="decimal"
            placeholder="0.00"
            error={err("price")}
          />
          <p className="mt-1 text-xs text-text-secondary">{f.priceHint}</p>
        </div>
        <Input
          id="svc-child-price"
          name="childPrice"
          label={f.childPrice}
          inputMode="decimal"
          placeholder="0.00"
          error={err("childPrice")}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" name="isChildService" className="size-4 accent-accent" />
        <span className="text-sm text-text-primary">{f.isChild}</span>
      </label>

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? f.adding : f.add}
        </Button>
        {state?.saved && !pending && <span className="text-sm text-success">{dict.saved}</span>}
      </div>
    </form>
  );
}
