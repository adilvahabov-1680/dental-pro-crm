"use client";

import { useActionState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { selectRescheduleOptionAction } from "@/lib/actions/patient-response";
import type { PatientResponseFormState } from "@/lib/validation/patient-response";

/**
 * Public (no-login) выбор одного из 2–3 вариантов времени, предложенных
 * клиникой (сессия 43). Пациент не видит ничего, кроме этих вариантов —
 * никакого полного календаря врача.
 */
export function RescheduleOptionsSelectionForm({
  token,
  options,
  labels,
}: {
  token: string;
  options: Array<{ id: string; startsAt: string; endsAt: string }>;
  labels: {
    chooseOption: string;
    note: string;
    select: string;
    submitting: string;
    thankYou: string;
    errors: Record<string, string>;
  };
}) {
  const [state, formAction, pending] = useActionState<PatientResponseFormState | undefined, FormData>(
    selectRescheduleOptionAction,
    undefined,
  );

  if (state?.success) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[10px] border border-success/30 bg-success/10 px-4 py-6 text-center"
        data-e2e-marker="reschedule-select-success"
      >
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm font-medium text-success">{labels.thankYou}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" data-e2e-marker="reschedule-options-select-form">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm font-medium text-text-primary">{labels.chooseOption}</p>

      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="submit"
            name="optionId"
            value={o.id}
            disabled={pending}
            data-e2e-marker={`reschedule-option-${o.id}`}
            className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-info/30 bg-info/10 px-4 py-3 text-left text-sm text-info transition-colors hover:bg-info/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <CalendarClock className="size-4" />
              {new Date(o.startsAt).toLocaleDateString("az-AZ", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}{" "}
              {new Date(o.startsAt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-xs font-medium">{labels.select}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-text-secondary" data-e2e-marker="reschedule-options-note">
        {labels.note}
      </p>

      {state?.error && (
        <p className="text-sm text-danger" data-e2e-marker="reschedule-select-error">
          {labels.errors[state.error] ?? labels.errors.generic}
        </p>
      )}

      {pending && <p className="text-xs text-text-secondary">{labels.submitting}</p>}
    </form>
  );
}
