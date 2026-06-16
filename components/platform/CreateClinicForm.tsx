"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClinic } from "@/lib/actions/platform";
import { useToast } from "@/components/ui/Toaster";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinics"]["form"];
type ErrorLabels = Dict["platform"]["errors"];
type RoleLabels = Dict["roles"];

const CLINIC_TYPES = ["clinic", "solo_doctor"] as const;

export function CreateClinicForm({
  labels,
  errorLabels,
  roleLabels: _roleLabels,
}: {
  labels: Labels;
  errorLabels: ErrorLabels;
  roleLabels: RoleLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    createClinic,
    undefined,
  );
  const toast = useToast();
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
        <span>{labels.title}</span>
        <span className="text-text-tertiary">{open ? "▲" : "▼"}</span>
      </button>

      <form action={action} data-e2e-create-clinic className={`border-t border-border-subtle p-4${open ? "" : " hidden"}`}>
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
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.clinicName}</label>
              <input name="name" required maxLength={200} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.clinicType}</label>
              <select name="clinicType" defaultValue="clinic" className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40">
                {CLINIC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "clinic" ? "Klinika" : "Solo həkim"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.phone}</label>
              <input name="phone" maxLength={50} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.email}</label>
              <input name="email" type="text" maxLength={255} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.address}</label>
              <input name="address" maxLength={500} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>

            <div className="sm:col-span-2 mt-2 border-t border-border-subtle/50 pt-3">
              <p className="mb-2 text-xs font-semibold text-text-tertiary uppercase tracking-wide">İlk Admin</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminName}</label>
              <input name="adminName" required maxLength={200} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminEmail}</label>
              <input name="adminEmail" type="text" required maxLength={255} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.adminPassword}</label>
              <input name="adminPassword" required minLength={6} maxLength={100} className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" defaultValue="" />
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
    </div>
  );
}
