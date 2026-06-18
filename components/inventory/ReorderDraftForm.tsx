"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createSupplierOrderDraftsFromLowStockAction } from "@/lib/actions/low-stock-reorder";
import { LowStockAlertBadge } from "@/components/inventory/LowStockAlertBadge";
import { formatQty } from "@/lib/utils";
import type { LowStockAlertRow } from "@/lib/low-stock";
import type { Dict } from "@/i18n/az";

type AlertsDict = Dict["inventory"]["alerts"];

export function ReorderDraftForm({
  rows,
  canManage,
  labels,
}: {
  rows: LowStockAlertRow[];
  canManage: boolean;
  labels: AlertsDict;
}) {
  const rd = labels.reorderDraft;
  const [state, formAction, pending] = useActionState(
    createSupplierOrderDraftsFromLowStockAction,
    undefined,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const distinctSuppliers = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (selected.has(r.id) && r.supplierId) ids.add(r.supplierId);
    }
    return ids.size;
  }, [rows, selected]);

  return (
    <form action={formAction} data-e2e-marker="reorder-draft-form">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-e2e-marker="alerts-table">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
              {canManage && <th className="pb-2 pr-3 font-medium">{rd.selectColumn}</th>}
              <th className="pb-2 pr-3 font-medium">{labels.table.material}</th>
              <th className="pb-2 pr-3 font-medium text-right">{labels.table.currentQty}</th>
              <th className="pb-2 pr-3 font-medium text-right">{labels.table.minQty}</th>
              <th className="pb-2 pr-3 font-medium">{labels.table.status}</th>
              <th className="pb-2 pr-3 font-medium text-right">{labels.table.suggestedReorder}</th>
              {canManage && <th className="pb-2 pr-3 font-medium text-right">{rd.qtyColumn}</th>}
              <th className="pb-2 pr-3 font-medium">{labels.table.supplier}</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const eligible = !!r.supplierId;
              const isSelected = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className="border-b border-border-subtle/50 last:border-0"
                  data-e2e-marker={`alert-row-${r.id}`}
                >
                  {canManage && (
                    <td className="py-2 pr-3">
                      <input type="hidden" name={`items[${idx}].inventoryItemId`} value={r.id} />
                      <input
                        type="checkbox"
                        name={`items[${idx}].selected`}
                        disabled={!eligible || pending}
                        checked={isSelected}
                        onChange={() => toggle(r.id)}
                        data-e2e-marker={`reorder-select-${r.id}`}
                        className="size-4 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      {!eligible && (
                        <span
                          className="ml-1 text-[10px] text-text-secondary"
                          data-e2e-marker={`reorder-no-supplier-${r.id}`}
                        >
                          {rd.noSupplierMarker}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-text-primary">
                    {r.name}
                    {r.categoryName && (
                      <span className="ml-1 text-xs text-text-secondary">· {r.categoryName}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                    {`${formatQty(r.quantity)} ${r.unit}`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                    {`${formatQty(r.minQuantity)} ${r.unit}`}
                  </td>
                  <td className="py-2 pr-3">
                    <LowStockAlertBadge status={r.status} label={labels.status[r.status]} />
                  </td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums text-text-primary"
                    data-e2e-marker={`alert-suggested-${r.id}`}
                  >
                    {`${formatQty(r.suggestedBaseQuantity)} ${r.unit}`}
                    {r.suggestedPurchaseUnits !== null && (
                      <span className="ml-1 text-xs text-text-secondary">
                        {`(~${r.suggestedPurchaseUnits} ${r.purchaseUnit})`}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        name={`items[${idx}].quantity`}
                        min="0.001"
                        step="0.001"
                        defaultValue={r.suggestedBaseQuantity}
                        disabled={!eligible || !isSelected || pending}
                        aria-label={rd.qtyColumn}
                        data-e2e-marker={`reorder-qty-${r.id}`}
                        className="w-24 rounded-lg border border-border-subtle bg-bg-base px-2 py-1 text-right text-sm tabular-nums text-text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
                      />
                    </td>
                  )}
                  <td className="py-2 pr-3">
                    {r.supplierId ? (
                      <Link
                        href={`/inventory/suppliers/${r.supplierId}`}
                        className="text-[11px] text-accent transition-opacity hover:opacity-70"
                        data-e2e-marker={`alert-supplier-${r.id}`}
                      >
                        {r.supplierName}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-text-secondary">{labels.table.noSupplier}</span>
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <Link
                      href={`/inventory/${r.id}`}
                      className="text-[11px] text-accent transition-opacity hover:opacity-70"
                      data-e2e-marker={`alert-go-to-item-${r.id}`}
                    >
                      {labels.table.goToItem}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="mt-4 space-y-3 border-t border-border-subtle pt-4" data-e2e-marker="reorder-draft-controls">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">{rd.noteLabel}</label>
            <textarea
              name="note"
              placeholder={rd.notePlaceholder}
              rows={2}
              disabled={pending}
              className="w-full max-w-md rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {distinctSuppliers > 1 && (
            <p className="text-xs text-text-secondary" data-e2e-marker="reorder-multi-supplier-note">
              {rd.groupedBySupplierNote}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={selected.size === 0 || pending}
              data-e2e-marker="reorder-create-button"
              className="h-10 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? rd.creating : rd.createButton}
            </button>
            <span className="text-xs text-text-secondary">{rd.autoSendNote}</span>
          </div>

          {state?.error && (
            <p className="text-sm text-danger" data-e2e-marker="reorder-error">
              {rd.errors[state.error as keyof typeof rd.errors] ?? rd.errors.generic}
            </p>
          )}

          {state?.createdOrders && state.createdOrders.length > 0 && (
            <div
              className="rounded-[10px] border border-success/30 bg-success/10 p-3"
              data-e2e-marker="reorder-success"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" /> {rd.createdTitle}
              </p>
              <ul className="mt-2 space-y-1">
                {state.createdOrders.map((o) => (
                  <li key={o.orderId} className="flex items-center gap-2 text-sm">
                    <span className="text-text-primary">{o.supplierName}</span>
                    <span className="text-text-secondary">· {o.orderNumber}</span>
                    <Link
                      href={`/inventory/supplier-orders/${o.orderId}`}
                      className="text-accent transition-opacity hover:opacity-70"
                      data-e2e-marker={`reorder-order-link-${o.orderId}`}
                    >
                      {rd.goToOrder}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
