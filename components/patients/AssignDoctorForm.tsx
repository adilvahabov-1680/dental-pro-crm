"use client";

import { useActionState, useRef } from "react";
import { assignPatientDoctor } from "@/lib/actions/admin";
import type { AdminFormState } from "@/lib/validation/admin";
import type { Dict } from "@/i18n/az";

interface DoctorOption {
  id: string;       // Doctor profile id (primaryDoctorId value)
  name: string;
}

export function AssignDoctorForm({
  patientId,
  currentDoctorId,
  doctors,
  labels,
  errorLabels,
}: {
  patientId: string;
  currentDoctorId: string | null;
  doctors: DoctorOption[];
  labels: Dict["admin"]["assignment"];
  errorLabels: Dict["admin"]["errors"];
}) {
  const [state, action, pending] = useActionState<AdminFormState | undefined, FormData>(
    assignPatientDoctor,
    undefined,
  );
  const prevState = useRef<typeof state>(undefined);
  if (state !== prevState.current) prevState.current = state;

  const errorMsg = state?.error
    ? (errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic)
    : null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-e2e-assign-doctor={patientId}>
      <input type="hidden" name="patientId" value={patientId} />
      <select
        name="doctorId"
        defaultValue={currentDoctorId ?? ""}
        className="h-8 rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
      >
        <option value="">{labels.notAssigned}</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[8px] border border-accent/30 bg-accent/10 px-3 text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {pending ? labels.saving : labels.save}
      </button>
      {state?.saved && !pending && (
        <span className="text-xs text-success">{labels.saved}</span>
      )}
      {errorMsg && <span className="text-xs text-danger">{errorMsg}</span>}
    </form>
  );
}
