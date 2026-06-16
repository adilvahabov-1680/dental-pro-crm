"use client";

import { useActionState } from "react";
import { Zap } from "lucide-react";
import { applyProtocol } from "@/lib/actions/protocols";
import type { ProtocolFormState } from "@/lib/validation/protocols";

interface Protocol {
  id: string;
  name: string;
  steps: { id: string }[];
}

interface Labels {
  applyTitle: string;
  applyDesc: string;
  applySelect: string;
  applyBtn: string;
  applying: string;
  applied: string;
  error: string;
}

interface Props {
  patientId: string;
  treatmentPlanId: string;
  doctorId: string;
  protocols: Protocol[];
  labels: Labels;
}

export function ApplyProtocolForm({
  patientId,
  treatmentPlanId,
  doctorId,
  protocols,
  labels,
}: Props) {
  const [state, action, pending] = useActionState<ProtocolFormState | undefined, FormData>(
    applyProtocol,
    undefined,
  );

  if (protocols.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-accent/20 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="size-4 text-accent" />
        <p className="text-sm font-semibold text-text-primary">{labels.applyTitle}</p>
      </div>
      <p className="mb-3 text-xs text-text-secondary">{labels.applyDesc}</p>

      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="treatmentPlanId" value={treatmentPlanId} />
        <input type="hidden" name="doctorId" value={doctorId} />

        <select
          name="protocolId"
          required
          className="h-9 flex-1 min-w-[200px] rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          defaultValue=""
        >
          <option value="" disabled>{labels.applySelect}</option>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.steps.length})
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.15)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? labels.applying : labels.applyBtn}
        </button>
      </form>

      {state?.saved && (
        <p className="mt-2 text-xs font-medium text-success">{labels.applied}</p>
      )}
      {state?.error && (
        <p className="mt-2 text-xs text-error">{labels.error}</p>
      )}
    </div>
  );
}
