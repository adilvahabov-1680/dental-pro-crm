"use client";

import { useActionState, useState } from "react";
import { applyTreatmentConsumablesAction } from "@/lib/actions/treatment-consumables";
import type { TreatmentConsumableTemplate, TreatmentConsumableUsageRow } from "@/lib/treatment-consumables";
import type { ConsumableUsageFormState } from "@/lib/validation/treatment-consumables";
import type { Dict } from "@/i18n/az";

const inputCls =
  "h-9 w-20 rounded-[10px] border border-border-subtle bg-bg-base/60 px-2 text-right text-sm " +
  "tabular-nums text-text-primary outline-none transition-colors focus:border-accent " +
  "focus:ring-2 focus:ring-accent/30 disabled:opacity-50";

function TemplateRow({
  template,
  index,
  labels,
}: {
  template: TreatmentConsumableTemplate;
  index: number;
  labels: Dict["treatments"]["consumables"];
}) {
  const [qty, setQty] = useState(String(template.defaultQuantity));
  const [skipped, setSkipped] = useState(false);

  const numQty = parseFloat(qty.replace(",", ".")) || 0;
  const baseQty =
    template.unit === "dose" && template.doseToBaseFactor
      ? numQty * template.doseToBaseFactor
      : numQty;
  const enoughStock = template.currentStock >= baseQty;

  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-[10px] border border-border-subtle/60 bg-bg-base/40 p-3 ${skipped ? "opacity-50" : ""}`}
      data-e2e-marker={`consumable-row-${template.inventoryItemId}`}
    >
      <input type="hidden" name={`items[${index}].inventoryItemId`} value={template.inventoryItemId} />
      <input
        type="hidden"
        name={`items[${index}].templateId`}
        value={template.templateId}
      />
      <input
        type="hidden"
        name={`items[${index}].unit`}
        value={template.unit}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{template.itemName}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {labels.unit}: <span className="font-medium">{template.unit}</span>
          {template.unit === "dose" && template.doseToBaseFactor && (
            <span className="ml-2 text-text-secondary/70">
              ({labels.doseHint
                .replace("{n}", String(template.doseToBaseFactor))
                .replace("{unit}", template.itemUnit)})
            </span>
          )}
          {" · "}
          {labels.stockQty}: <span className={enoughStock ? "text-success" : "text-danger"}>
            {template.currentStock.toLocaleString("az-AZ", { maximumFractionDigits: 3 })} {template.itemUnit}
          </span>
        </p>
        {template.isRequired && (
          <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
            {labels.required}
          </span>
        )}
        {template.allowOverride && !template.isRequired && (
          <span className="mt-1 inline-block rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-secondary">
            {labels.override}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {template.allowOverride ? (
          <input
            name={`items[${index}].quantity`}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            disabled={skipped}
            aria-label={labels.qty}
            className={inputCls}
          />
        ) : (
          <>
            <input type="hidden" name={`items[${index}].quantity`} value={template.defaultQuantity} />
            <span className="text-sm tabular-nums text-text-primary">{template.defaultQuantity}</span>
          </>
        )}

        {!enoughStock && !skipped && (
          <span className="text-[11px] text-danger">{labels.stockLow}</span>
        )}
        {enoughStock && !skipped && (
          <span className="text-[11px] text-text-secondary/60">{labels.stockOk}</span>
        )}

        {!template.isRequired && (
          <label className="flex cursor-pointer items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              name={`items[${index}].wasSkipped`}
              value="on"
              checked={skipped}
              onChange={(e) => setSkipped(e.target.checked)}
              className="size-3 accent-accent"
            />
            {labels.skip}
          </label>
        )}
        {template.isRequired && (
          <input type="hidden" name={`items[${index}].wasSkipped`} value="false" />
        )}
      </div>
    </div>
  );
}

export function TreatmentConsumableChecklist({
  treatmentItemId,
  templates,
  existingUsages,
  dict,
  canManage,
}: {
  treatmentItemId: string;
  templates: TreatmentConsumableTemplate[];
  existingUsages: TreatmentConsumableUsageRow[];
  dict: Dict["treatments"];
  canManage: boolean;
}) {
  const labels = dict.consumables;
  const [state, formAction, pending] = useActionState<ConsumableUsageFormState | undefined, FormData>(
    applyTreatmentConsumablesAction,
    undefined,
  );

  const alreadyApplied = existingUsages.length > 0;
  const hasNonSkipped = existingUsages.some((u) => !u.wasSkipped && u.inventoryMovementId);

  if (templates.length === 0) {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-4 py-4 text-center text-sm text-text-secondary">
        {labels.noTemplates}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* show existing applied usages */}
      {alreadyApplied && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {labels.usageTitle}
          </h3>
          {existingUsages.map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle/50 bg-bg-base/30 px-3 py-2 text-sm ${u.wasSkipped ? "opacity-50" : ""}`}
              data-e2e-marker={`usage-row-${u.inventoryItemId}`}
            >
              <span className="text-text-primary">{u.itemName}</span>
              <span className="tabular-nums text-text-secondary">
                {u.wasSkipped
                  ? labels.skipped
                  : `${u.quantity} ${u.unit} → ${u.baseQuantity} ${u.baseUnit}`}
              </span>
            </div>
          ))}
          {hasNonSkipped && (
            <p className="rounded-[10px] border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
              {labels.alreadyApplied}
            </p>
          )}
        </div>
      )}

      {/* apply form — only if canManage and not yet applied */}
      {canManage && !hasNonSkipped && (
        <form action={formAction} data-e2e-marker="consumable-apply-form">
          <input type="hidden" name="treatmentItemId" value={treatmentItemId} />
          <div className="space-y-2">
            {templates.map((t, i) => (
              <TemplateRow key={t.inventoryItemId} template={t} index={i} labels={labels} />
            ))}
          </div>

          {state?.error && (
            <p className="mt-2 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
            </p>
          )}
          {state?.saved && (
            <p className="mt-2 rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {labels.alreadyApplied}
            </p>
          )}

          <div className="mt-3">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-[10px] bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? labels.applying : labels.apply}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
