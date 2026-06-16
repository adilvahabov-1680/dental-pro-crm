"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateClinicParams } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import type { SettingsFormState } from "@/lib/validation/settings";
import type { Dict } from "@/i18n/az";

export function ClinicParamsForm({
  dict,
  params,
  canManage,
}: {
  dict: Dict["settings"];
  params: {
    defaultAppointmentMinutes: number;
    reminderHoursBefore: number;
    doctorSeesAllPatients: boolean;
  };
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    updateClinicParams,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) toast(dict.saved, "success");
  }, [state, dict.saved, toast]);
  const f = dict.params;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  return (
    <form action={formAction}>
      <fieldset disabled={!canManage} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="defaultAppointmentMinutes"
            name="defaultAppointmentMinutes"
            label={f.defaultMinutes}
            inputMode="numeric"
            required
            defaultValue={String(params.defaultAppointmentMinutes)}
            error={err("defaultAppointmentMinutes")}
          />
          <Input
            id="reminderHoursBefore"
            name="reminderHoursBefore"
            label={f.reminderHours}
            inputMode="numeric"
            required
            defaultValue={String(params.reminderHoursBefore)}
            error={err("reminderHoursBefore")}
          />
        </div>

        <div className="rounded-[10px] border border-border-subtle bg-bg-base/40 p-3">
          <p className="mb-2 text-sm font-medium text-text-primary">{f.visibilityTitle}</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="doctorSeesAllPatients"
              defaultChecked={params.doctorSeesAllPatients}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="block text-sm text-text-primary">{f.doctorSeesAll}</span>
              <span className="block text-xs text-text-secondary">{f.doctorSeesAllHint}</span>
            </span>
          </label>
        </div>

        {state?.error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
          </p>
        )}

        {canManage && (
          <Button type="submit" disabled={pending}>
            {pending ? dict.saving : dict.save}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
