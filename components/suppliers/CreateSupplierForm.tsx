"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SupplierFormState } from "@/lib/validation/suppliers";
import type { Dict } from "@/i18n/az";

export function CreateSupplierForm({ dict }: { dict: Dict["suppliers"] }) {
  const [state, formAction, pending] = useActionState<SupplierFormState | undefined, FormData>(
    createSupplier,
    undefined,
  );
  const f = dict.form;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? (dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic)
      : undefined;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border-subtle bg-bg-surface/80 p-5"
    >
      <h2 className="text-base font-semibold">{f.title}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input id="name" name="name" label={f.name} required error={err("name")} />
        </div>
        <Input id="contactName" name="contactName" label={f.contactName} />
        <Input id="phone" name="phone" label={f.phone} type="tel" />
        <Input id="whatsapp" name="whatsapp" label={f.whatsapp} type="tel" />
        <Input id="email" name="email" label={f.email} type="email" error={err("email")} />
        <div className="sm:col-span-2">
          <Input id="address" name="address" label={f.address} />
        </div>
        <div className="sm:col-span-2">
          <Input id="notes" name="notes" label={f.notes} />
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
          href="/inventory/suppliers"
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
