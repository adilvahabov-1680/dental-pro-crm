"use client";

import { useActionState } from "react";
import { BellPlus } from "lucide-react";
import { createRecallTaskAction } from "@/lib/actions/recall-tasks";
import type { RecallFormState } from "@/lib/validation/recall-tasks";

interface Labels {
  formTitle: string;
  presets: { d7: string; d30: string; m6: string };
  dueDateLabel: string;
  titleLabel: string;
  noteLabel: string;
  submit: string;
  saved: string;
  errors: Record<string, string>;
}

/** Форма «Kontrol xatırlatması yarat» (сессия 44): preset 7g/30g/6ay или öz tarixi. */
export function RecallCreateForm({
  patientId,
  treatmentItemId,
  serviceId,
  doctorId,
  defaultTitle,
  labels,
}: {
  patientId: string;
  treatmentItemId: string;
  serviceId: string | null;
  doctorId: string | null;
  defaultTitle: string;
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState<RecallFormState | undefined, FormData>(
    createRecallTaskAction,
    undefined,
  );
  const inputId = `recall-due-${treatmentItemId}`;

  const setPresetDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (input) input.value = d.toISOString().slice(0, 10);
  };
  const setPresetMonths = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (input) input.value = d.toISOString().slice(0, 10);
  };

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <BellPlus className="size-4 text-accent" />
        <p className="text-sm font-semibold text-text-primary">{labels.formTitle}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPresetDays(7)}
          className="rounded-[8px] border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {labels.presets.d7}
        </button>
        <button
          type="button"
          onClick={() => setPresetDays(30)}
          className="rounded-[8px] border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {labels.presets.d30}
        </button>
        <button
          type="button"
          onClick={() => setPresetMonths(6)}
          className="rounded-[8px] border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {labels.presets.m6}
        </button>
      </div>

      <form action={formAction} className="space-y-3" data-e2e-marker="recall-create-form">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="treatmentItemId" value={treatmentItemId} />
        {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}
        {doctorId && <input type="hidden" name="doctorId" value={doctorId} />}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.dueDateLabel}
            </label>
            <input
              id={inputId}
              name="dueDate"
              type="date"
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {state?.fieldErrors?.dueDate && (
              <p className="mt-0.5 text-xs text-danger">
                {labels.errors[state.fieldErrors.dueDate] ?? labels.errors.generic}
              </p>
            )}
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.titleLabel}
            </label>
            <input
              name="title"
              defaultValue={defaultTitle}
              maxLength={200}
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {labels.noteLabel}
          </label>
          <input
            name="note"
            maxLength={1000}
            className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {labels.submit}
          </button>
          {state?.success && (
            <span className="text-sm font-medium text-success">{labels.saved}</span>
          )}
          {state?.error && (
            <span className="text-sm text-danger">{labels.errors[state.error] ?? labels.errors.generic}</span>
          )}
        </div>
      </form>
    </div>
  );
}
