"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createTreatmentPlan } from "@/lib/actions/treatments";
import type { TreatmentFormState } from "@/lib/validation/treatments";

/** Инлайн-создание плана лечения (title only, MVP). */
export function PlanCreateForm({
  patientId,
  labels,
}: {
  patientId: string;
  labels: { newTitle: string; titleLabel: string; create: string; error: string };
}) {
  const [state, formAction, pending] = useActionState<TreatmentFormState | undefined, FormData>(
    createTreatmentPlan,
    undefined,
  );
  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-center gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input
        name="title"
        placeholder={`${labels.newTitle}: ${labels.titleLabel}…`}
        className="h-9 min-w-64 flex-1 rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 sm:max-w-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
      >
        <Plus className="size-3.5" /> {labels.create}
      </button>
      {state?.fieldErrors?.title && <span className="text-xs text-danger">{labels.error}</span>}
    </form>
  );
}
