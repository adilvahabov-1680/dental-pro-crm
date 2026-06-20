"use client";

import { useActionState } from "react";
import { cn } from "@/lib/utils";
import type { RecallFormState } from "@/lib/validation/recall-tasks";

type RecallAction = (
  prev: RecallFormState | undefined,
  formData: FormData,
) => Promise<RecallFormState>;

/** Generic single-field staff action (mark-scheduled / dismiss) — сессия 44. */
export function RecallSimpleActionButton({
  action,
  recallTaskId,
  label,
  doneLabel,
  errors,
  tone = "neutral",
}: {
  action: RecallAction;
  recallTaskId: string;
  label: string;
  doneLabel: string;
  errors: Record<string, string>;
  tone?: "neutral" | "danger";
}) {
  const [state, formAction, pending] = useActionState<RecallFormState | undefined, FormData>(
    action,
    undefined,
  );

  if (state?.success) {
    return <span className="text-[11px] text-success">{doneLabel}</span>;
  }

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-0.5">
      <input type="hidden" name="recallTaskId" value={recallTaskId} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center rounded-[8px] border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          tone === "danger"
            ? "border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
            : "border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary",
        )}
      >
        {label}
      </button>
      {state?.error && (
        <span className="text-[11px] text-danger">{errors[state.error] ?? errors.generic}</span>
      )}
    </form>
  );
}
