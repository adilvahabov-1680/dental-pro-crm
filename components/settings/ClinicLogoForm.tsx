"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadClinicLogo } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import type { ClinicLogoFormState } from "@/lib/validation/clinicLogo";
import type { Dict } from "@/i18n/az";

export function ClinicLogoForm({
  dict,
  clinic,
  canManage,
}: {
  dict: Dict["settings"];
  clinic: { id: string; name: string; logoUrl: string | null; updatedAt: Date };
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<ClinicLogoFormState | undefined, FormData>(
    uploadClinicLogo,
    undefined,
  );
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const prevState = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) {
      toast(dict.logo.saved, "success");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state, dict.logo.saved, toast]);

  const f = dict.logo;
  const src = clinic.logoUrl
    ? `/api/clinic-logo/${clinic.id}?v=${clinic.updatedAt.getTime()}`
    : null;

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <p className="mb-2 text-sm font-medium text-text-primary">{f.title}</p>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border-subtle bg-bg-elevated">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={clinic.name} className="size-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-text-secondary">
              {clinic.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {canManage && (
          <form
            action={formAction}
            data-clinic-logo-form
            className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              ref={fileRef}
              type="file"
              name="logo"
              required
              accept="image/png,image/jpeg,image/webp"
              className="block flex-1 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 text-sm text-text-secondary file:mr-3 file:h-9 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-bg-elevated file:px-3 file:text-sm file:text-text-primary"
            />
            <Button type="submit" disabled={pending}>
              {pending ? f.uploading : f.upload}
            </Button>
          </form>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-text-secondary/80">{f.hint}</p>

      {state?.error && (
        <p className="mt-2 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
    </div>
  );
}
