"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addCatalogItemToOrderFromSupplierPage } from "@/lib/actions/supplier-orders";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { Dict } from "@/i18n/az";

export function AddToOrderButton({
  supplierId,
  catalogItemId,
  dict,
}: {
  supplierId: string;
  catalogItemId: string;
  dict: Dict["supplierOrders"];
}) {
  const [_state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    addCatalogItemToOrderFromSupplierPage,
    undefined,
  );

  return (
    <form action={formAction} data-e2e-marker={`add-to-order-${catalogItemId}`}>
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="catalogItemId" value={catalogItemId} />
      <input type="hidden" name="quantity" value="1" />
      <button
        type="submit"
        disabled={pending}
        title={dict.addToOrder}
        className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
      >
        <Plus className="size-4" />
      </button>
    </form>
  );
}
