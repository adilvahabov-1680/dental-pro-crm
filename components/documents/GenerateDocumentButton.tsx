"use client";

import { useActionState } from "react";
import { FileDown } from "lucide-react";
import { generateTreatmentSummary, generateInvoicePdf } from "@/lib/actions/documents";
import { Button } from "@/components/ui/Button";
import type { DocumentFormState } from "@/lib/validation/documents";

/**
 * Кнопка генерации PDF: kind=summary → Müalicə çıxarışı (hidden patientId),
 * kind=invoice → Hesab sənədi (hidden invoiceId). Успех = redirect на
 * /documents/[id] из server action.
 */
export function GenerateDocumentButton({
  kind,
  targetId,
  labels,
  errors,
  variant = "secondary",
}: {
  kind: "summary" | "invoice";
  targetId: string;
  labels: { button: string; saving: string };
  errors: Record<string, string>;
  variant?: "primary" | "secondary";
}) {
  const action = kind === "summary" ? generateTreatmentSummary : generateInvoicePdf;
  const [state, formAction, pending] = useActionState<DocumentFormState | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input
        type="hidden"
        name={kind === "summary" ? "patientId" : "invoiceId"}
        value={targetId}
      />
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      <Button type="submit" variant={variant} disabled={pending} className="w-full">
        <FileDown className="size-4" /> {pending ? labels.saving : labels.button}
      </Button>
    </form>
  );
}
