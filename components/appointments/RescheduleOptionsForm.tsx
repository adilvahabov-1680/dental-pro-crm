"use client";

import { useActionState, useEffect, useRef } from "react";
import { CalendarClock } from "lucide-react";
import { proposeRescheduleOptions } from "@/lib/actions/reschedule-options";
import type { RescheduleOptionsFormState } from "@/lib/validation/reschedule-options";

/**
 * Staff-форма «Pasiyent vaxt dəyişmək istəyir» (сессия 43): 2 обязательных +
 * 1 опциональный вариант времени → готовит WhatsApp-сообщение со ссылкой
 * выбора (click-to-chat, сервер ничего не отправляет сам). Appointment не
 * двигается здесь — перенос делает только сам пациент по публичной ссылке.
 */
export function RescheduleOptionsForm({
  appointmentId,
  alreadySent,
  labels,
}: {
  appointmentId: string;
  alreadySent: boolean;
  labels: {
    title: string;
    desc: string;
    option1: string;
    option2: string;
    option3: string;
    submit: string;
    prepared: string;
    alreadySent: string;
    errors: Record<string, string>;
  };
}) {
  const [state, formAction, pending] = useActionState<RescheduleOptionsFormState | undefined, FormData>(
    proposeRescheduleOptions,
    undefined,
  );
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (state?.waUrl && state.waUrl !== openedRef.current) {
      openedRef.current = state.waUrl;
      window.open(state.waUrl, "_blank", "noopener");
    }
  }, [state?.waUrl]);

  return (
    <div
      className="mt-2 rounded-[10px] border border-warning/30 bg-warning/5 p-3"
      data-e2e-marker="reschedule-options-block"
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-warning">
        <CalendarClock className="size-3.5" /> {labels.title}
      </p>
      <p className="mb-2 text-[11px] text-text-secondary">{labels.desc}</p>
      {alreadySent && (
        <p className="mb-2 text-[11px] text-success">{labels.alreadySent}</p>
      )}

      <form action={formAction} className="space-y-2" data-e2e-marker="reschedule-options-form">
        <input type="hidden" name="appointmentId" value={appointmentId} />
        {(
          [
            { n: 1, label: labels.option1, required: true },
            { n: 2, label: labels.option2, required: true },
            { n: 3, label: labels.option3, required: false },
          ] as const
        ).map((o) => (
          <div key={o.n} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-text-secondary">{o.label}</label>
              <input
                type="date"
                name={`option${o.n}Date`}
                required={o.required}
                className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface px-2 text-sm text-text-primary"
              />
            </div>
            <input
              type="time"
              name={`option${o.n}Time`}
              required={o.required}
              className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface px-2 text-sm text-text-primary"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {labels.submit}
        </button>
        {state?.success && state.waUrl && (
          <p className="text-[11px] text-success">{labels.prepared}</p>
        )}
        {state?.error && (
          <p className="text-[11px] text-danger">{labels.errors[state.error] ?? labels.errors.generic}</p>
        )}
      </form>
    </div>
  );
}
