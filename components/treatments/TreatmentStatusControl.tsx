"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { updateTreatmentItemStatus } from "@/lib/actions/treatments";
import type { TreatmentFormState } from "@/lib/validation/treatments";
import { cn } from "@/lib/utils";

/** Быстрая смена статуса процедуры (только при treatments.manage). */
export function TreatmentStatusControl({
  treatmentItemId,
  status,
  options,
}: {
  treatmentItemId: string;
  status: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState<TreatmentFormState | undefined, FormData>(
    updateTreatmentItemStatus,
    undefined,
  );
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="treatmentItemId" value={treatmentItemId} />
      <select
        name="status"
        defaultValue={status}
        key={status}
        className={cn(
          "h-8 cursor-pointer rounded-[8px] border border-border-subtle bg-bg-base/60 px-2 text-xs text-text-primary",
          "outline-none transition-colors focus:border-accent [&>option]:bg-bg-elevated",
          state?.error && "border-danger",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        title="OK"
        className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent disabled:opacity-50"
      >
        <Check className="size-4" />
      </button>
    </form>
  );
}
