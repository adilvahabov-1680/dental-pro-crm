"use client";

import { useActionState } from "react";
import { deactivateSupplier } from "@/lib/actions/suppliers";
import type { SupplierFormState } from "@/lib/validation/suppliers";
import type { Dict } from "@/i18n/az";

export function DeactivateSupplierButton({
  supplierId,
  dict,
}: {
  supplierId: string;
  dict: Dict["suppliers"];
}) {
  const [state, formAction, pending] = useActionState<SupplierFormState | undefined, FormData>(
    deactivateSupplier,
    undefined,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="supplierId" value={supplierId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        onClick={(e) => {
          if (!confirm(dict.deactivate + "?")) e.preventDefault();
        }}
      >
        {pending ? dict.deactivating : dict.deactivate}
      </button>
      {state?.error && (
        <p className="mt-2 text-xs text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
    </form>
  );
}
