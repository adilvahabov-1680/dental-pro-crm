"use client";

import { useActionState } from "react";
import {
  updateConsumableTemplate,
  deleteConsumableTemplate,
} from "@/lib/actions/service-consumables";
import type { ServiceConsumableFormState } from "@/lib/validation/service-consumables";
import type { ConsumableTemplateRow } from "@/lib/service-consumables";
import type { Dict } from "@/i18n/az";

function TemplateRow({
  row,
  dict,
}: {
  row: ConsumableTemplateRow;
  dict: Dict["settings"];
}) {
  const cp = dict.services.consumablesPage;
  const [updateState, updateAction, updatePending] = useActionState<
    ServiceConsumableFormState | undefined,
    FormData
  >(updateConsumableTemplate, undefined);
  const [, deleteAction, deletePending] = useActionState<
    ServiceConsumableFormState | undefined,
    FormData
  >(deleteConsumableTemplate, undefined);

  const unitOptions = [{ value: row.itemUnit, label: row.itemUnit }];
  if (row.doseToBaseFactor !== null) {
    unitOptions.push({
      value: "dose",
      label: `doza (1 doza = ${row.doseToBaseFactor} ${row.itemUnit})`,
    });
  }

  const errKey = updateState?.error ?? (updateState?.fieldErrors ? Object.values(updateState.fieldErrors)[0] : undefined);

  return (
    <div
      className="rounded-xl border border-border-subtle bg-bg-surface p-3 space-y-3"
      data-e2e-marker={`template-row-${row.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">{row.itemName}</p>
          <p className="text-xs text-text-secondary">
            {cp.unitBase}: {row.itemUnit}
            {row.doseToBaseFactor !== null && (
              <> · 1 doza = {row.doseToBaseFactor} {row.itemUnit}</>
            )}
          </p>
        </div>
        <form action={deleteAction}>
          <input type="hidden" name="templateId" value={row.id} />
          <button
            type="submit"
            disabled={deletePending}
            onClick={(e) => {
              if (!window.confirm(cp.confirmDelete)) e.preventDefault();
            }}
            className="text-xs text-danger/70 transition-colors hover:text-danger disabled:opacity-50"
            data-e2e-marker={`delete-template-${row.id}`}
          >
            {deletePending ? cp.deleting : cp.delete}
          </button>
        </form>
      </div>

      <form action={updateAction} className="grid gap-2 sm:grid-cols-2" data-e2e-marker={`update-form-${row.id}`}>
        <input type="hidden" name="templateId" value={row.id} />
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">{cp.qty}</label>
          <input
            name="quantity"
            inputMode="decimal"
            defaultValue={String(row.quantity)}
            className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">{cp.unit}</label>
          <select
            name="unit"
            defaultValue={row.unit}
            className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            {unitOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="isRequired"
              value="on"
              defaultChecked={row.isRequired}
              className="size-3.5 rounded border-border-subtle accent-accent"
            />
            {cp.required}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="allowOverride"
              value="on"
              defaultChecked={row.allowOverride}
              className="size-3.5 rounded border-border-subtle accent-accent"
            />
            {cp.override}
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">{cp.note}</label>
          <input
            name="note"
            placeholder={cp.notePlaceholder}
            defaultValue={row.note ?? ""}
            className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={updatePending}
            className="h-8 rounded-[10px] border border-accent/40 bg-accent/10 px-3 text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {updatePending ? cp.saving : cp.save}
          </button>
          {updateState?.saved && !updatePending && (
            <span className="text-xs text-success">✓</span>
          )}
          {errKey && (
            <span className="text-xs text-danger">
              {(dict.errors as Record<string, string>)[errKey] ?? dict.errors.generic}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

export function ServiceConsumablesList({
  templates,
  dict,
}: {
  templates: ConsumableTemplateRow[];
  dict: Dict["settings"];
}) {
  const cp = dict.services.consumablesPage;
  if (templates.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-text-secondary">{cp.empty}</p>
    );
  }
  return (
    <div className="space-y-3">
      {templates.map((t) => (
        <TemplateRow key={t.id} row={t} dict={dict} />
      ))}
    </div>
  );
}
