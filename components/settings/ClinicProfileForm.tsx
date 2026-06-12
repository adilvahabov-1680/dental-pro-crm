"use client";

import { useActionState } from "react";
import { updateClinicProfile } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SettingsFormState } from "@/lib/validation/settings";
import type { Dict } from "@/i18n/az";

export function ClinicProfileForm({
  dict,
  clinic,
  canManage,
}: {
  dict: Dict["settings"];
  clinic: { name: string; phone: string | null; email: string | null; address: string | null };
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    updateClinicProfile,
    undefined,
  );
  const f = dict.profile;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  return (
    <form action={formAction}>
      <fieldset disabled={!canManage} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input id="name" name="name" label={f.name} required defaultValue={clinic.name} error={err("name")} />
          </div>
          <Input id="phone" name="phone" label={f.phone} defaultValue={clinic.phone ?? ""} placeholder="+994 …" />
          <Input id="email" name="email" label={f.email} defaultValue={clinic.email ?? ""} error={err("email")} />
          <div className="sm:col-span-2">
            <Input id="address" name="address" label={f.address} defaultValue={clinic.address ?? ""} />
          </div>
        </div>
        <p className="text-xs text-text-secondary">{f.logoSoon}</p>

        {state?.error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
          </p>
        )}

        {canManage && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? dict.saving : dict.save}
            </Button>
            {state?.saved && !pending && <span className="text-sm text-success">{dict.saved}</span>}
          </div>
        )}
      </fieldset>
    </form>
  );
}
