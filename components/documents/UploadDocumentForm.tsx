"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadPatientDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { DocumentFormState } from "@/lib/validation/documents";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export function UploadDocumentForm({
  patientId,
  typeOptions,
  labels,
  errors,
  compact = false,
}: {
  patientId: string;
  typeOptions: Array<{ value: string; label: string }>;
  labels: {
    title: string;
    file: string;
    typeLabel: string;
    titleLabel: string;
    titleHint: string;
    submit: string;
    uploading: string;
    success: string;
    hint: string;
  };
  errors: Record<string, string>;
  /** компактный вариант для блока на карточке пациента */
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DocumentFormState | undefined, FormData>(
    uploadPatientDocument,
    undefined,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-3" data-upload-form={patientId}>
      <input type="hidden" name="patientId" value={patientId} />
      <div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
        <div>
          <label htmlFor={`file-${patientId}`} className="mb-1.5 block text-sm text-text-secondary">
            {labels.file}
          </label>
          <input
            ref={fileRef}
            id={`file-${patientId}`}
            name="file"
            type="file"
            required
            accept={ACCEPT}
            className="block w-full cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 text-sm text-text-secondary file:mr-3 file:h-10 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-bg-elevated file:px-3 file:text-sm file:text-text-primary"
          />
          <p className="mt-1 text-[11px] text-text-secondary/80">{labels.hint}</p>
        </div>
        <Select id={`type-${patientId}`} name="type" label={labels.typeLabel} defaultValue="other">
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <div className={compact ? "" : "sm:col-span-2"}>
          <Input id={`title-${patientId}`} name="title" label={labels.titleLabel} />
          <p className="mt-1 text-[11px] text-text-secondary/80">{labels.titleHint}</p>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Upload className="size-4" /> {pending ? labels.uploading : labels.submit}
        </Button>
        {state?.uploadedId && !pending && (
          <span className="text-sm text-success">{labels.success}</span>
        )}
      </div>
    </form>
  );
}
