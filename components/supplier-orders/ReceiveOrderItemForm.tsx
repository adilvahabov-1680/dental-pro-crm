"use client";

import { useActionState, useState } from "react";
import { PackageCheck } from "lucide-react";
import { receiveSupplierOrderItem } from "@/lib/actions/supplier-receiving";
import type { SupplierOrderFull } from "@/lib/supplier-orders";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { InventoryItemFull } from "@/lib/inventory";
import type { Dict } from "@/i18n/az";

type Item = SupplierOrderFull["items"][number];

export function ReceiveOrderItemForm({
  item,
  inventoryItems,
  dict,
}: {
  item: Item;
  inventoryItems: InventoryItemFull[];
  dict: Dict["supplierOrders"];
}) {
  const [state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    receiveSupplierOrderItem,
    undefined,
  );
  const [mode, setMode] = useState<"select" | "create">("select");

  if (item.stockMovementId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        <PackageCheck className="size-3" />
        {dict.receivedToInventory}
      </span>
    );
  }

  return (
    <form action={formAction} data-e2e-marker={`receive-${item.id}`} className="space-y-2">
      <input type="hidden" name="orderItemId" value={item.id} />

      {/* Mode toggle */}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("select")}
          className={`rounded px-2 py-1 transition-colors ${mode === "select" ? "bg-accent text-white" : "bg-bg-surface text-text-secondary hover:bg-bg-surface/80 border border-border-subtle"}`}
        >
          {dict.selectInventoryItem}
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`rounded px-2 py-1 transition-colors ${mode === "create" ? "bg-accent text-white" : "bg-bg-surface text-text-secondary hover:bg-bg-surface/80 border border-border-subtle"}`}
        >
          {dict.createInventoryItem}
        </button>
      </div>

      {mode === "select" ? (
        <select
          name="inventoryItemId"
          required
          className="w-full rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">— {dict.selectInventoryItem} —</option>
          {inventoryItems.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.name}{inv.sku ? ` (${inv.sku})` : ""} — {inv.unit}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="createNew" value="true" />
      )}

      {/* Quantity */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          name="receivedQty"
          min="0.001"
          step="0.001"
          defaultValue={Number(item.quantity)}
          required
          className={`w-24 rounded-lg border px-2 py-1 text-sm tabular-nums text-text-primary bg-bg-base focus:outline-none focus:ring-1 focus:ring-accent ${state?.fieldErrors?.receivedQty ? "border-danger" : "border-border-subtle"}`}
        />
        <span className="text-xs text-text-secondary">{item.unitSnapshot ?? "ədəd"}</span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <PackageCheck className="size-3.5" />
          {pending ? dict.receiving : dict.receiveToInventory}
        </button>
      </div>

      {state?.error && (
        <p className="text-xs text-danger">{dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}</p>
      )}
      {state?.success && (
        <p className="text-xs text-success">{dict.receiveSuccess}</p>
      )}
      {state?.fieldErrors?.receivedQty && (
        <p className="text-xs text-danger">{dict.errors.quantityInvalid}</p>
      )}
    </form>
  );
}
