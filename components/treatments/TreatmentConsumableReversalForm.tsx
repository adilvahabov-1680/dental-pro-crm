"use client";

import { useActionState } from "react";
import { reverseTreatmentConsumablesAction } from "@/lib/actions/treatment-consumables";
import type { ConsumableUsageFormState } from "@/lib/validation/treatment-consumables";
import type { Dict } from "@/i18n/az";

/**
 * Reversal form — always rendered in DOM so $ACTION_* inputs are present in SSR HTML.
 * Mounted only when hasActiveUsages=true; no expand/collapse pattern.
 */
export function TreatmentConsumableReversalForm({
  treatmentItemId,
  dict,
}: {
  treatmentItemId: string;
  dict: Dict["treatments"];
}) {
  const labels = dict.consumables.reversal;
  const errors = dict.errors;

  const [state, formAction, pending] = useActionState<ConsumableUsageFormState | undefined, FormData>(
    reverseTreatmentConsumablesAction,
    undefined,
  );

  return (
    <div
      className="rounded-[10px] border border-danger/25 bg-danger/5 p-3 space-y-2"
      data-e2e-marker="reversal-form-panel"
    >
      <p className="text-xs font-medium text-danger">{labels.confirmMsg}</p>

      <form action={formAction} className="space-y-2" data-e2e-marker="reversal-form">
        <input type="hidden" name="treatmentItemId" value={treatmentItemId} />

        <div className="flex items-start gap-2">
          <textarea
            name="reason"
            rows={1}
            placeholder={labels.reasonPlaceholder}
            required
            minLength={3}
            maxLength={500}
            className="min-w-0 flex-1 resize-none rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-danger focus:ring-2 focus:ring-danger/20"
            data-e2e-marker="reversal-reason-input"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-9 shrink-0 rounded-[10px] bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            data-e2e-marker="reversal-submit-btn"
          >
            {pending ? labels.submitting : labels.title}
          </button>
        </div>

        {state?.error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {errors[state.error as keyof typeof errors] ?? errors.generic}
          </p>
        )}
      </form>
    </div>
  );
}
