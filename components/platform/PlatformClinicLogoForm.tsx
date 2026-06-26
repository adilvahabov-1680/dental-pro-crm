"use client";

import { useActionState, useEffect, useRef } from "react";
import { platformUploadClinicLogo } from "@/lib/actions/platform";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinicDetail"]["logo"];
type ErrorLabels = Dict["platform"]["errors"];

export function PlatformClinicLogoForm({
  clinic,
  labels,
  errorLabels,
}: {
  clinic: { id: string; name: string; logoUrl: string | null; updatedAt: Date };
  labels: Labels;
  errorLabels: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    platformUploadClinicLogo,
    undefined,
  );
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const prevState = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) {
      toast(labels.saved, "success");
      if (fileRef.current) fileRef.current.value = "";
    } else if (state?.error) {
      toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
    }
  }, [state, toast, errorLabels, labels.saved]);

  const src = clinic.logoUrl
    ? `/api/clinic-logo/${clinic.id}?v=${clinic.updatedAt.getTime()}`
    : null;

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{labels.title}</h2>
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

        <form
          action={action}
          data-e2e-platform-logo={clinic.id}
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="clinicId" value={clinic.id} />
          <input
            ref={fileRef}
            type="file"
            name="logo"
            required
            accept="image/png,image/jpeg,image/webp"
            className="block flex-1 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 text-sm text-text-secondary file:mr-3 file:h-9 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-bg-elevated file:px-3 file:text-sm file:text-text-primary"
          />
          <Button type="submit" disabled={pending}>
            {pending ? labels.uploading : labels.upload}
          </Button>
        </form>
      </div>

      <p className="mt-1.5 text-[11px] text-text-secondary/80">{labels.hint}</p>
    </div>
  );
}
