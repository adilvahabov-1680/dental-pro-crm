"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { updateSupplierOrderItemQty, removeSupplierOrderItem } from "@/lib/actions/supplier-orders";
import type { SupplierOrderFull } from "@/lib/supplier-orders";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { Dict } from "@/i18n/az";

function QtyCell({
  item,
  dict,
}: {
  item: SupplierOrderFull["items"][number];
  dict: Dict["supplierOrders"];
}) {
  const [state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    updateSupplierOrderItemQty,
    undefined,
  );
  return (
    <form action={formAction} data-e2e-marker={`qty-${item.id}`}>
      <input type="hidden" name="orderItemId" value={item.id} />
      <input
        type="number"
        name="quantity"
        min="0.001"
        step="0.001"
        defaultValue={Number(item.quantity)}
        onBlur={(e) => {
          const form = e.currentTarget.form;
          if (form && e.currentTarget.value !== String(Number(item.quantity))) form.requestSubmit();
        }}
        disabled={pending}
        className={`w-24 rounded-lg border px-2 py-1 text-sm tabular-nums text-text-primary bg-bg-base focus:outline-none focus:ring-1 focus:ring-accent ${state?.fieldErrors?.quantity ? "border-danger" : "border-border-subtle"}`}
      />
    </form>
  );
}

function RemoveButton({
  itemId,
  dict,
}: {
  itemId: string;
  dict: Dict["supplierOrders"];
}) {
  const [state, formAction, pending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    removeSupplierOrderItem,
    undefined,
  );
  return (
    <form action={formAction} data-e2e-marker={`remove-${itemId}`}>
      <input type="hidden" name="orderItemId" value={itemId} />
      <button
        type="submit"
        disabled={pending}
        title={dict.remove}
        className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}

export function OrderItemsTable({
  order,
  dict,
  canManage,
}: {
  order: SupplierOrderFull;
  dict: Dict["supplierOrders"];
  canManage: boolean;
}) {
  const isDraft = order.status === "draft";
  const it = dict.itemsTable;

  if (order.items.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface/60 px-6 py-10 text-center">
        <p className="font-medium text-text-primary">{dict.orderEmpty.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{dict.orderEmpty.desc}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-surface/80">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.name}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.sku}</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.quantity}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.unit}</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.price}</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">{it.total}</th>
            {canManage && isDraft && (
              <th className="px-4 py-3" />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {order.items.map((item) => {
            const rowTotal = Number(item.priceSnapshot) * Number(item.quantity);
            return (
              <tr key={item.id} className="hover:bg-bg-surface transition-colors">
                <td className="px-4 py-3 font-medium text-text-primary">{item.nameSnapshot}</td>
                <td className="px-4 py-3 tabular-nums text-text-secondary">{item.skuSnapshot ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {canManage && isDraft ? (
                    <QtyCell item={item} dict={dict} />
                  ) : (
                    <span>{Number(item.quantity)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{item.unitSnapshot ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {Number(item.priceSnapshot).toFixed(2)} {item.currencySnapshot}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-text-primary">
                  {rowTotal.toFixed(2)} {item.currencySnapshot}
                </td>
                {canManage && isDraft && (
                  <td className="px-4 py-3">
                    <RemoveButton itemId={item.id} dict={dict} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border-subtle">
          <tr>
            <td colSpan={canManage && isDraft ? 5 : 5} className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {it.total}
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
              {(order.totalCost / 100).toFixed(2)} AZN
            </td>
            {canManage && isDraft && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
