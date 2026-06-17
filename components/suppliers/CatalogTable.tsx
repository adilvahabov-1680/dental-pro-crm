"use client";

import { useActionState, useOptimistic, startTransition } from "react";
import { PackageSearch } from "lucide-react";
import { deactivateSupplierCatalogItem } from "@/lib/actions/suppliers";
import type { CatalogItemRow } from "@/lib/suppliers";
import type { SupplierFormState } from "@/lib/validation/suppliers";
import type { Dict } from "@/i18n/az";

function DeactivateButton({
  itemId,
  dict,
  onDeactivate,
}: {
  itemId: string;
  dict: Dict["suppliers"];
  onDeactivate: (id: string) => void;
}) {
  const [state, formAction, pending] = useActionState<SupplierFormState | undefined, FormData>(
    deactivateSupplierCatalogItem,
    undefined,
  );
  void state;

  return (
    <form
      action={(fd) => {
        startTransition(() => {
          onDeactivate(itemId);
        });
        return formAction(fd);
      }}
    >
      <input type="hidden" name="catalogItemId" value={itemId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        {dict.catalog.deactivate}
      </button>
    </form>
  );
}

export function CatalogTable({
  items,
  dict,
  canManage,
}: {
  items: CatalogItemRow[];
  dict: Dict["suppliers"];
  canManage: boolean;
}) {
  const [optimisticItems, deactivateOptimistic] = useOptimistic(
    items,
    (state, id: string) => state.filter((i) => i.id !== id),
  );

  const c = dict.catalog;

  if (optimisticItems.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface/60 px-6 py-12 text-center">
        <PackageSearch className="mx-auto mb-3 size-10 text-text-secondary/40" />
        <p className="font-medium text-text-primary">{dict.catalogEmpty.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{dict.catalogEmpty.desc}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-surface/60 text-left text-xs font-medium text-text-secondary">
            <th className="px-4 py-3">{c.sku}</th>
            <th className="px-4 py-3">{c.name}</th>
            <th className="px-4 py-3">{c.category}</th>
            <th className="px-4 py-3">{c.brand}</th>
            <th className="px-4 py-3">{c.unit}</th>
            <th className="px-4 py-3 text-right">{c.price}</th>
            <th className="px-4 py-3">{c.availability}</th>
            {canManage && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {optimisticItems.map((item) => (
            <tr key={item.id} className="bg-bg-surface/80 hover:bg-bg-surface">
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                {item.sku ?? "—"}
              </td>
              <td className="px-4 py-3 font-medium text-text-primary">{item.name}</td>
              <td className="px-4 py-3 text-text-secondary">{item.category ?? "—"}</td>
              <td className="px-4 py-3 text-text-secondary">{item.brand ?? "—"}</td>
              <td className="px-4 py-3 text-text-secondary">{item.unit ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                {Number(item.price).toFixed(2)} {item.currency}
              </td>
              <td className="px-4 py-3 text-text-secondary">{item.availability ?? "—"}</td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  <DeactivateButton
                    itemId={item.id}
                    dict={dict}
                    onDeactivate={deactivateOptimistic}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
