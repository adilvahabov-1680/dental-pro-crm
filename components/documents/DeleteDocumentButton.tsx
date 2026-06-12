"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteUploadedDocument } from "@/lib/actions/documents";
import type { DocumentFormState } from "@/lib/validation/documents";

/**
 * Soft-delete загруженного документа с простым confirm().
 * Показывается только при documents.manage и только для kind=upload.
 */
export function DeleteDocumentButton({
  documentId,
  labels,
  small = false,
}: {
  documentId: string;
  labels: { button: string; confirm: string; failed: string };
  small?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DocumentFormState | undefined, FormData>(
    deleteUploadedDocument,
    undefined,
  );

  return (
    <form
      action={formAction}
      data-del={documentId}
      onSubmit={(e) => {
        if (!window.confirm(labels.confirm)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={pending}
        className={
          small
            ? "inline-flex cursor-pointer items-center gap-1 text-[11px] text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
            : "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border border-danger/30 bg-danger/10 px-3 text-xs text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
        }
      >
        <Trash2 className={small ? "size-3" : "size-3.5"} /> {labels.button}
      </button>
      {state?.error && <span className="text-[11px] text-danger">{labels.failed}</span>}
    </form>
  );
}
