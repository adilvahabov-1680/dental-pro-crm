"use client";

import { useActionState } from "react";
import { Ban } from "lucide-react";
import { cancelInvoice } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import type { FinanceFormState } from "@/lib/validation/finance";

export function CancelInvoiceButton({
  invoiceId,
  labels,
  errors,
}: {
  invoiceId: string;
  labels: { button: string; cancelling: string; confirm: string };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<FinanceFormState | undefined, FormData>(
    cancelInvoice,
    undefined,
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(labels.confirm)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      <Button type="submit" variant="danger" disabled={pending} className="w-full">
        <Ban className="size-4" /> {pending ? labels.cancelling : labels.button}
      </Button>
    </form>
  );
}
