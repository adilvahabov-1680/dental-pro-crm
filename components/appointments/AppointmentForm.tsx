"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createAppointment } from "@/lib/actions/appointments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { AppointmentFormState } from "@/lib/validation/appointments";
import type { Dict } from "@/i18n/az";

interface Option {
  id: string;
  name: string;
}

export function AppointmentForm({
  dict,
  patients,
  doctors,
  doctorLocked,
  defaults,
  durations,
}: {
  dict: Dict["appointments"];
  patients: Option[];
  doctors: Option[];
  /** doctor/assistant не выбирают врача — фиксированный */
  doctorLocked: boolean;
  defaults: { patientId?: string; doctorId?: string; date: string; time: string };
  durations: readonly number[];
}) {
  const [state, formAction, pending] = useActionState<AppointmentFormState | undefined, FormData>(
    createAppointment,
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
          <Select
            id="patientId"
            name="patientId"
            label={f.patient}
            required
            defaultValue={defaults.patientId ?? ""}
            error={err("patientId")}
          >
            <option value="">{f.patientNone}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {doctorLocked ? (
          <>
            <input type="hidden" name="doctorId" value={defaults.doctorId ?? ""} />
            <Input
              label={f.doctor}
              value={doctors.find((d) => d.id === defaults.doctorId)?.name ?? "—"}
              disabled
            />
          </>
        ) : (
          <Select
            id="doctorId"
            name="doctorId"
            label={f.doctor}
            required
            defaultValue={defaults.doctorId ?? ""}
            error={err("doctorId")}
          >
            <option value="">—</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}

        <Select id="durationMin" name="durationMin" label={f.duration} defaultValue="30">
          {durations.map((d) => (
            <option key={d} value={d}>
              {d} {f.durationMin}
            </option>
          ))}
        </Select>

        <Input
          id="date"
          name="date"
          type="date"
          label={f.date}
          required
          defaultValue={defaults.date}
          error={err("date")}
        />
        <Input
          id="time"
          name="time"
          type="time"
          label={f.time}
          required
          defaultValue={defaults.time}
          error={err("time")}
        />

        <Input id="complaint" name="complaint" label={f.complaint} />
        <Input id="chair" name="chair" label={f.chair} />
        <div className="sm:col-span-2">
          <Textarea id="notes" name="notes" label={f.notes} />
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
          href="/appointments"
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
