"use client";

import { useActionState } from "react";
import { assignDoctorAssistant, removeAssistantLink } from "@/lib/actions/admin";
import type { AdminFormState } from "@/lib/validation/admin";
import type { DoctorForAdmin, AssistantUserForAdmin } from "@/lib/admin";
import type { Dict } from "@/i18n/az";

const selectCls =
  "h-8 rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary " +
  "focus:outline-none focus:ring-1 focus:ring-accent/40";

function errMsg(dict: Dict["admin"], state: AdminFormState | undefined): string | undefined {
  if (!state?.error) return undefined;
  return dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic;
}

function AssignAssistantForm({
  doctorUserId,
  availableAssistants,
  dict,
}: {
  doctorUserId: string;
  availableAssistants: AssistantUserForAdmin[];
  dict: Dict["admin"];
}) {
  const [state, action, pending] = useActionState<AdminFormState | undefined, FormData>(
    assignDoctorAssistant,
    undefined,
  );
  const la = dict.assignment;
  const error = errMsg(dict, state);

  if (availableAssistants.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 mt-2" data-e2e-assign-assistant={doctorUserId}>
      <input type="hidden" name="doctorUserId" value={doctorUserId} />
      <select name="assistantUserId" className={selectCls} defaultValue="">
        <option value="" disabled>{la.assistantNone}</option>
        {availableAssistants.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.fullName}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[8px] border border-accent/30 bg-accent/10 px-3 text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {la.assignAssistant}
      </button>
      {state?.saved && !pending && <span className="text-xs text-success">{dict.saved}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

function RemoveAssistantForm({
  assistantUserId,
  fullName,
  dict,
}: {
  assistantUserId: string;
  fullName: string;
  dict: Dict["admin"];
}) {
  const [state, action, pending] = useActionState<AdminFormState | undefined, FormData>(
    removeAssistantLink,
    undefined,
  );
  const error = errMsg(dict, state);

  return (
    <form action={action} className="flex items-center gap-2" data-e2e-remove-assistant={assistantUserId}>
      <input type="hidden" name="assistantUserId" value={assistantUserId} />
      <span className="text-xs text-text-primary">{fullName}</span>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-danger underline-offset-2 hover:underline disabled:opacity-50"
      >
        {dict.assignment.removeAssistant}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export function DoctorAssistantsCard({
  doctors,
  allAssistants,
  dict,
}: {
  doctors: DoctorForAdmin[];
  allAssistants: AssistantUserForAdmin[];
  dict: Dict["admin"];
}) {
  const la = dict.assignment;

  if (doctors.length === 0) {
    return (
      <div className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-4 py-3 text-xs text-text-secondary">
        {la.noDoctors}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {doctors.map((doc) => {
        // Assistants not yet linked to THIS doctor (available to assign)
        const available = allAssistants.filter(
          (a) => a.linkedDoctorUserId !== doc.doctorUserId,
        );

        return (
          <div
            key={doc.doctorUserId}
            className="rounded-[10px] border border-border-subtle bg-bg-base/50 p-4"
            data-e2e-doctor-row={doc.doctorUserId}
          >
            <p className="text-sm font-medium text-text-primary">{doc.doctorName}</p>

            <div className="mt-2">
              <p className="text-xs text-text-secondary">{la.assistants}:</p>
              {doc.linkedAssistants.length === 0 ? (
                <p className="mt-1 text-xs text-text-tertiary">{la.noAssistants}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {doc.linkedAssistants.map((a) => (
                    <li key={a.assistantUserId}>
                      <RemoveAssistantForm
                        assistantUserId={a.assistantUserId}
                        fullName={a.fullName}
                        dict={dict}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <AssignAssistantForm
              doctorUserId={doc.doctorUserId}
              availableAssistants={available}
              dict={dict}
            />
          </div>
        );
      })}
    </div>
  );
}
