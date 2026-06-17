"use client";

import { useActionState } from "react";
import { ShoppingCart } from "lucide-react";
import { createSupplierOrderDraft } from "@/lib/actions/supplier-orders";
import { Button } from "@/components/ui/Button";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { Dict } from "@/i18n/az";

export function CreateOrderButton({
  supplierId,
  dict,
}: {
  supplierId: string;
  dict: Dict["supplierOrders"];
}) {
  const [_state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    createSupplierOrderDraft,
    undefined,
  );

  return (
    <form action={formAction} data-e2e-marker="create-order">
      <input type="hidden" name="supplierId" value={supplierId} />
      <Button type="submit" disabled={pending} variant="secondary" className="w-full justify-center">
        <ShoppingCart className="size-4" />
        {pending ? "…" : dict.newOrder}
      </Button>
    </form>
  );
}
