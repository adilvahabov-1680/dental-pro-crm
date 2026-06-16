"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { platformCreateUser } from "@/lib/actions/platform";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinics"]["form"] & { addUser: string };
type ErrorLabels = Dict["platform"]["errors"];
type RoleLabels = Dict["roles"];

const ASSIGNABLE = ["owner", "admin", "doctor", "reception", "assistant", "accountant"] as const;

export function CreateClinicUserForm({
  clinicId,
  labels,
  errorLabels,
  roleLabels,
}: {
  clinicId: string;
  labels: Labels;
  errorLabels: ErrorLabels;
  roleLabels: RoleLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    platformCreateUser,
    undefined,
  );
  const prevState = useRef<typeof state>(undefined);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) setOpen(false);
  }, [state]);

  const errorMsg = state?.error ? (errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic) : null;

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary"
      >
        <span>{labels.addUser}</span>
        <span className="text-text-tertiary">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form action={action} className="border-t border-border-subtle p-4">
          <input type="hidden" name="clinicId" value={clinicId} />

          {state?.saved && state.tempPassword && (
            <div className="mb-4 rounded-[10px] border border-success/30 bg-success/10 p-3 text-sm">
              <p className="font-medium text-success">{labels.createdTitle}</p>
              <p className="mt-1 text-text-secondary">{labels.createdNote}</p>
              <p className="mt-2 font-mono text-text-primary">
                {state.adminEmail} / <strong>{state.tempPassword}</strong>
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminName}</label>
              <input name="fullName" required maxLength={200} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminEmail}</label>
              <input name="email" type="text" required maxLength={255} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.phone}</label>
              <input name="phone" maxLength={50} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Rol</label>
              <select name="roleKey" defaultValue="doctor" className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40">
                {ASSIGNABLE.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminPassword}</label>
              <input name="tempPassword" required minLength={6} maxLength={100} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" defaultValue="" />
            </div>
          </div>

          {errorMsg && (
            <p className="mt-3 rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 h-9 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? labels.creating : labels.create}
          </button>
        </form>
      )}
    </div>
  );
}
