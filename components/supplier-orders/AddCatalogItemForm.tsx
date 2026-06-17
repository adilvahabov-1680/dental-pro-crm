"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addCatalogItemToSupplierOrder } from "@/lib/actions/supplier-orders";
import { Button } from "@/components/ui/Button";
import type { CatalogItemRow } from "@/lib/suppliers";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { Dict } from "@/i18n/az";

export function AddCatalogItemForm({
  orderId,
  catalogItems,
  dict,
}: {
  orderId: string;
  catalogItems: CatalogItemRow[];
  dict: Dict["supplierOrders"];
}) {
  const [state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    addCatalogItemToSupplierOrder,
    undefined,
  );

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5">
      <h3 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">
        {dict.addToOrder}
      </h3>

      <form action={formAction} data-e2e-marker="add-catalog-item" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {dict.itemsTable.name}
          </label>
          <select
            name="catalogItemId"
            required
            className="w-full rounded-[10px] border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {catalogItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.sku ? ` (${item.sku})` : ""}
                {" — "}
                {Number(item.price).toFixed(2)} {item.currency}
              </option>
            ))}
          </select>
        </div>

        <div className="w-28">
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {dict.quantity}
          </label>
          <input
            type="number"
            name="quantity"
            min="0.001"
            step="0.001"
            defaultValue="1"
            required
            className={`w-full rounded-[10px] border px-3 py-2 text-sm tabular-nums text-text-primary bg-bg-base focus:outline-none focus:ring-1 focus:ring-accent ${state?.fieldErrors?.quantity ? "border-danger" : "border-border-subtle"}`}
          />
          {state?.fieldErrors?.quantity && (
            <p className="mt-1 text-xs text-danger">
              {dict.errors[state.fieldErrors.quantity as keyof typeof dict.errors] ?? dict.errors.generic}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending}>
          <Plus className="size-3.5" />
          {pending ? dict.adding : dict.addToOrder}
        </Button>
      </form>

      {state?.error && (
        <p className="mt-3 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
    </div>
  );
}
