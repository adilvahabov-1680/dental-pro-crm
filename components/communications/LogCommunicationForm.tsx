"use client";

import { useActionState, useEffect, useRef } from "react";
import { logPatientCommunication } from "@/lib/actions/communications";
import type { CommunicationFormState } from "@/lib/validation/communications";

export function LogCommunicationForm({
  patientId,
  channelOptions,
  labels,
  errors,
}: {
  patientId: string;
  channelOptions: Array<{ value: string; label: string }>;
  labels: {
    channel: string;
    message: string;
    messagePlaceholder: string;
    submit: string;
    saving: string;
    success: string;
  };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<CommunicationFormState | undefined, FormData>(
    logPatientCommunication,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="mb-3 rounded-[10px] border border-border-subtle bg-bg-base/40 p-3">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-text-secondary">{labels.channel}</label>
          <select
            name="channel"
            defaultValue={channelOptions[0]?.value}
            className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface px-2 text-sm text-text-primary"
          >
            {channelOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-[11px] text-text-secondary">{labels.message}</label>
          <input
            name="message"
            type="text"
            maxLength={2000}
            placeholder={labels.messagePlaceholder}
            className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-sm text-text-primary placeholder:text-text-secondary/60"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? labels.saving : labels.submit}
        </button>
      </div>
      {state?.success && <p className="mt-1.5 text-[11px] text-success">{labels.success}</p>}
      {state?.error && (
        <p className="mt-1.5 text-[11px] text-danger">{errors[state.error] ?? errors.generic}</p>
      )}
    </form>
  );
}
