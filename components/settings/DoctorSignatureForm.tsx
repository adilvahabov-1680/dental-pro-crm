"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadOwnDoctorSignature } from "@/lib/actions/profile";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import type { DoctorSignatureFormState } from "@/lib/validation/doctorSignature";
import type { Dict } from "@/i18n/az";

export function DoctorSignatureForm({
  dict,
  /** Готовый URL /api/doctor-signature/{id}?v=... либо null — вычисляется на сервере. */
  signatureSrc,
}: {
  dict: Dict["settings"];
  signatureSrc: string | null;
}) {
  const [state, formAction, pending] = useActionState<DoctorSignatureFormState | undefined, FormData>(
    uploadOwnDoctorSignature,
    undefined,
  );
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const prevState = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) {
      toast(dict.signature.saved, "success");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state, dict.signature.saved, toast]);

  const f = dict.signature;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border-subtle bg-bg-elevated">
          {signatureSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureSrc} alt={f.title} className="size-full object-contain p-1" />
          ) : (
            <span className="px-2 text-center text-xs text-text-secondary">{f.empty}</span>
          )}
        </div>

        <form
          action={formAction}
          data-doctor-signature-form
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            ref={fileRef}
            type="file"
            name="signature"
            required
            accept="image/png,image/jpeg,image/webp"
            className="block flex-1 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 text-sm text-text-secondary file:mr-3 file:h-9 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-bg-elevated file:px-3 file:text-sm file:text-text-primary"
          />
          <Button type="submit" disabled={pending}>
            {pending ? f.uploading : f.upload}
          </Button>
        </form>
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
