"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateClinic } from "@/lib/actions/platform";
import { useToast } from "@/components/ui/Toaster";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinicDetail"]["editClinic"];
type ErrorLabels = Dict["platform"]["errors"];
type TypeLabels = Dict["platform"]["clinics"]["types"];
type StatusLabels = Dict["platform"]["clinics"]["statuses"];

const LOCALES = ["az", "ru", "en"] as const;
const CLINIC_TYPES = ["clinic", "solo_doctor"] as const;
const STATUSES = ["trial", "active", "suspended"] as const;

export function EditClinicForm({
  clinic,
  labels,
  errorLabels,
  typeLabels,
  statusLabels,
}: {
  clinic: {
    id: string;
    slug: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    timezone: string;
    currency: string;
    defaultLocale: "az" | "ru" | "en";
    clinicType: "clinic" | "solo_doctor";
    status: "trial" | "active" | "suspended";
    plan: string | null;
  };
  labels: Labels;
  errorLabels: ErrorLabels;
  typeLabels: TypeLabels;
  statusLabels: StatusLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    updateClinic,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) toast(labels.saved, "success");
    else if (state?.error) toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
  }, [state, toast, errorLabels, labels.saved]);

  const inputCls =
    "h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{labels.title}</h2>
      <form action={action} data-e2e-edit-clinic className="space-y-3">
        <input type="hidden" name="clinicId" value={clinic.id} />

        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>{labels.slugLabel}</span>
          <span className="font-mono text-text-primary">{clinic.slug}</span>
          <span>{labels.slugNote}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.name}</label>
            <input name="name" required maxLength={200} defaultValue={clinic.name} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.clinicType}</label>
            <select name="clinicType" defaultValue={clinic.clinicType} className={inputCls}>
              {CLINIC_TYPES.map((v) => (
                <option key={v} value={v}>
                  {typeLabels[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.phone}</label>
            <input name="phone" maxLength={50} defaultValue={clinic.phone ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.email}</label>
            <input name="email" type="text" maxLength={255} defaultValue={clinic.email ?? ""} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.address}</label>
            <input name="address" maxLength={500} defaultValue={clinic.address ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.timezone}</label>
            <input name="timezone" required maxLength={100} defaultValue={clinic.timezone} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.currency}</label>
            <input name="currency" required maxLength={3} minLength={3} defaultValue={clinic.currency} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.defaultLocale}</label>
            <select name="defaultLocale" defaultValue={clinic.defaultLocale} className={inputCls}>
              {LOCALES.map((v) => (
                <option key={v} value={v}>
                  {v.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.status}</label>
            <select name="status" defaultValue={clinic.status} className={inputCls}>
              {STATUSES.map((v) => (
                <option key={v} value={v}>
                  {statusLabels[v]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-text-secondary">{labels.plan}</label>
            <input name="plan" maxLength={100} defaultValue={clinic.plan ?? ""} className={inputCls} />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </form>
    </div>
  );
}
