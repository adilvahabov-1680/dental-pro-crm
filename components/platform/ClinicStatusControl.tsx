"use client";

import { useActionState, useEffect, useRef } from "react";
import { setClinicStatus } from "@/lib/actions/platform";
import { useToast } from "@/components/ui/Toaster";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinicDetail"];
type ErrorLabels = Dict["platform"]["errors"];

export function ClinicStatusControl({
  clinicId,
  currentStatus,
  labels,
  errorLabels,
}: {
  clinicId: string;
  currentStatus: "trial" | "active" | "suspended";
  labels: Labels;
  errorLabels: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    setClinicStatus,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) toast("Klinika statusu yeniləndi", "success");
    else if (state?.error) toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
  }, [state, toast, errorLabels]);

  const isSuspended = currentStatus === "suspended";
  const nextStatus = isSuspended ? "active" : "suspended";

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{labels.statusSection}</h2>
      <form action={action} className="flex items-center gap-3">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input type="hidden" name="status" value={nextStatus} />
        <button
          type="submit"
          disabled={pending}
          className={`h-9 rounded-[10px] px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${
            isSuspended
              ? "bg-success/10 border border-success/30 text-success"
              : "bg-danger/10 border border-danger/30 text-danger"
          }`}
        >
          {pending
            ? isSuspended
              ? labels.activating
              : labels.suspending
            : isSuspended
              ? labels.activate
              : labels.suspend}
        </button>
      </form>
    </div>
  );
}
