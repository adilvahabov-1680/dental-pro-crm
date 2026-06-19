"use client";

import { useActionState } from "react";
import { CheckCircle2, Clock, CalendarClock, XCircle } from "lucide-react";
import { submitPatientResponseAction } from "@/lib/actions/patient-response";
import type { PatientResponseFormState } from "@/lib/validation/patient-response";

type Labels = {
  chooseAnswer: string;
  options: {
    confirm: string;
    running_late: string;
    reschedule_request: string;
    cancel: string;
  };
  lateWarning: string;
  commentLabel: string;
  commentPlaceholder: string;
  submitting: string;
  thankYou: string;
  errors: Record<string, string>;
};

const OPTION_ICON: Record<string, typeof CheckCircle2> = {
  confirm: CheckCircle2,
  running_late: Clock,
  reschedule_request: CalendarClock,
  cancel: XCircle,
};

const OPTION_CLASS: Record<string, string> = {
  confirm: "border-success/30 bg-success/10 text-success hover:bg-success/20",
  running_late: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20",
  reschedule_request: "border-info/30 bg-info/10 text-info hover:bg-info/20",
  cancel: "border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
};

export function PatientResponseForm({ token, labels }: { token: string; labels: Labels }) {
  const [state, formAction, pending] = useActionState<PatientResponseFormState | undefined, FormData>(
    submitPatientResponseAction,
    undefined,
  );

  if (state?.success) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[10px] border border-success/30 bg-success/10 px-4 py-6 text-center"
        data-e2e-marker="response-success"
      >
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm font-medium text-success">{labels.thankYou}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" data-e2e-marker="patient-response-form">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm font-medium text-text-primary">{labels.chooseAnswer}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(labels.options) as Array<keyof typeof labels.options>).map((key) => {
          const Icon = OPTION_ICON[key];
          return (
            <button
              key={key}
              type="submit"
              name="responseType"
              value={key}
              disabled={pending}
              data-e2e-marker={`response-option-${key}`}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${OPTION_CLASS[key]}`}
            >
              <Icon className="size-4" /> {labels.options[key]}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-text-secondary" data-e2e-marker="late-warning">
        {labels.lateWarning}
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">{labels.commentLabel}</label>
        <textarea
          name="comment"
          placeholder={labels.commentPlaceholder}
          rows={2}
          disabled={pending}
          className="w-full rounded-[10px] border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger" data-e2e-marker="response-error">
          {labels.errors[state.error] ?? labels.errors.generic}
        </p>
      )}

      {pending && <p className="text-xs text-text-secondary">{labels.submitting}</p>}
    </form>
  );
}
