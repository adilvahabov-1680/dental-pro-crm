"use client";

import { useActionState, useState } from "react";
import { applyTreatmentConsumablesAction } from "@/lib/actions/treatment-consumables";
import { TreatmentConsumableReversalForm } from "@/components/treatments/TreatmentConsumableReversalForm";
import type { TreatmentConsumableTemplate, TreatmentConsumableUsageRow } from "@/lib/treatment-consumables";
import type { ConsumableUsageFormState } from "@/lib/validation/treatment-consumables";
import type { Dict } from "@/i18n/az";
import { formatDate } from "@/lib/utils";

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
  const hasActiveUsages = existingUsages.some((u) => !u.wasSkipped && u.inventoryMovementId && !u.isReversed);
  const hasNonSkipped = hasActiveUsages; // kept for form visibility logic
  const allReversed =
    existingUsages.some((u) => !u.wasSkipped && u.inventoryMovementId) &&
    existingUsages.filter((u) => !u.wasSkipped && u.inventoryMovementId).every((u) => u.isReversed);
  const reversalInfo = allReversed
    ? existingUsages.find((u) => u.isReversed && u.reversedAt)
    : null;

  // Audit trail data
  const nonSkippedWithMovement = existingUsages.filter((u) => !u.wasSkipped && u.inventoryMovementId);
  const reversedRows = nonSkippedWithMovement.filter((u) => u.isReversed);
  const activeRows = nonSkippedWithMovement.filter((u) => !u.isReversed);
  const skippedRows = existingUsages.filter((u) => u.wasSkipped);
  const hasReversal = reversedRows.length > 0;
  const hasReapply = hasReversal && activeRows.length > 0;
  const firstApplyRows = hasReversal ? reversedRows : activeRows;
  const reversalMeta = reversedRows[0] ?? null;

  // Only show "no templates" when nothing has been applied yet — if usages exist
  // (active or reversed), always render them regardless of current template count.
  if (!alreadyApplied && templates.length === 0) {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-4 py-4 text-center text-sm text-text-secondary">
        {labels.noTemplates}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Existing usages list ───────────────────────────────────────── */}
      {alreadyApplied && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {labels.usageTitle}
          </h3>

          {existingUsages.map((u) => {
            const qtyStr =
              u.unit !== u.baseUnit
                ? `${u.quantity} ${u.unit} → ${u.baseQuantity} ${u.baseUnit}`
                : `${u.quantity} ${u.unit}`;
            const statusLabel = u.wasSkipped
              ? labels.skippedLabel
              : u.isReversed
              ? labels.reversedLabel
              : labels.activeLabel;
            const statusCls = u.wasSkipped
              ? "text-text-secondary/60"
              : u.isReversed
              ? "text-warning"
              : "text-success";
            return (
              <div
                key={u.id}
                className="rounded-[10px] border border-border-subtle/50 bg-bg-base/30 px-3 py-2 text-sm"
                data-e2e-marker={`usage-row-${u.inventoryItemId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={u.wasSkipped || u.isReversed ? "text-text-secondary/60 line-through" : "text-text-primary"}>
                    {u.itemName}
                  </span>
                  <div className="flex items-center gap-2">
                    {!u.wasSkipped && (
                      <span className="tabular-nums text-text-secondary" data-e2e-marker={`usage-qty-${u.inventoryItemId}`}>
                        {qtyStr}
                      </span>
                    )}
                    <span className={`text-[11px] font-medium ${statusCls}`} data-e2e-marker={`usage-status-${u.inventoryItemId}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
                {/* Audit sub-row: movement marker + date + user */}
                {u.inventoryMovementId && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-0 text-[11px] text-text-secondary/70" data-e2e-marker={`usage-audit-${u.inventoryItemId}`}>
                    <span>{labels.movementMarker}: …{u.inventoryMovementId.slice(-8)}</span>
                    <span>{formatDate(u.createdAt)}</span>
                    {u.createdByName && <span>{u.createdByName}</span>}
                  </div>
                )}
                {/* Reversal details inline */}
                {u.isReversed && (
                  <div className="mt-1 space-y-0.5 pl-0 text-[11px] text-warning/80" data-e2e-marker={`reversal-detail-${u.inventoryItemId}`}>
                    {u.reversedAt && (
                      <span className="block">
                        {labels.reversal.reversedAt}: {formatDate(u.reversedAt)}
                        {u.reversedByName && <> · {u.reversedByName}</>}
                      </span>
                    )}
                    {u.reversalReason && (
                      <span className="block">
                        {labels.reversalReasonLabel}: {u.reversalReason}
                      </span>
                    )}
                    {u.reversalMovementId && (
                      <span className="block" data-e2e-marker={`reversal-movement-${u.inventoryItemId}`}>
                        {labels.movementMarker}: …{u.reversalMovementId.slice(-8)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* active usages: show "applied" notice + reversal button */}
          {hasActiveUsages && (
            <div className="space-y-2">
              <p className="rounded-[10px] border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent">
                {labels.alreadyApplied}
              </p>
              {canManage && (
                <TreatmentConsumableReversalForm
                  treatmentItemId={treatmentItemId}
                  dict={dict}
                />
              )}
            </div>
          )}

          {/* fully reversed: show reversal info */}
          {allReversed && reversalInfo && (
            <div
              className="rounded-[10px] border border-warning/30 bg-warning/5 px-3 py-2 space-y-1"
              data-e2e-marker="reversal-info-panel"
            >
              <p className="text-sm font-medium text-warning">{labels.reversal.reversedTitle}</p>
              {reversalInfo.reversedAt && (
                <p className="text-xs text-text-secondary">
                  {labels.reversal.reversedAt}:{" "}
                  {new Date(reversalInfo.reversedAt).toLocaleString("az-AZ")}
                </p>
              )}
              {reversalInfo.reversalReason && (
                <p className="text-xs text-text-secondary">
                  {labels.reversal.reversedReason}: {reversalInfo.reversalReason}
                </p>
              )}
              {canManage && (
                <p className="text-xs text-text-secondary">{labels.reversal.reapplyHint}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Audit trail "Sərfiyyat tarixçəsi" ───────────────────────── */}
      {alreadyApplied && (firstApplyRows.length > 0 || hasReversal) && (
        <div className="space-y-2" data-e2e-marker="audit-trail-section">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {labels.auditTitle}
          </h3>

          {/* Step 1: Initial apply */}
          {firstApplyRows.length > 0 && (
            <div className="rounded-[10px] border border-border-subtle/50 bg-bg-base/20 px-3 py-2">
              <p className="text-xs font-medium text-text-primary">
                ↓ {labels.auditApplied}
                {firstApplyRows[0]?.createdAt && (
                  <span className="ml-2 text-text-secondary font-normal">
                    {formatDate(firstApplyRows[0].createdAt)}
                  </span>
                )}
                {firstApplyRows[0]?.createdByName && (
                  <span className="ml-2 text-text-secondary font-normal">
                    · {firstApplyRows[0].createdByName}
                  </span>
                )}
              </p>
              <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-text-secondary">
                {firstApplyRows.map((u) => (
                  <li key={u.id}>
                    {u.itemName}: {u.quantity} {u.unit}
                    {u.unit !== u.baseUnit && ` (= ${u.baseQuantity} ${u.baseUnit})`}
                    {" "}— <span className="text-warning">{labels.stockDeducted}</span>
                  </li>
                ))}
                {skippedRows.map((u) => (
                  <li key={u.id} className="text-text-secondary/50">
                    {u.itemName} — {labels.skippedLabel}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 2: Reversal */}
          {hasReversal && reversalMeta && (
            <div className="rounded-[10px] border border-warning/30 bg-warning/5 px-3 py-2" data-e2e-marker="audit-reversal-step">
              <p className="text-xs font-medium text-warning">
                ↺ {labels.auditReversed}
                {reversalMeta.reversedAt && (
                  <span className="ml-2 font-normal text-text-secondary">
                    {formatDate(reversalMeta.reversedAt)}
                  </span>
                )}
                {reversalMeta.reversedByName && (
                  <span className="ml-2 font-normal text-text-secondary">
                    · {reversalMeta.reversedByName}
                  </span>
                )}
              </p>
              {reversalMeta.reversalReason && (
                <p className="mt-0.5 text-[11px] text-text-secondary">
                  {labels.reversalReasonLabel}: {reversalMeta.reversalReason}
                </p>
              )}
              <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-text-secondary">
                {reversedRows.map((u) => (
                  <li key={u.id}>
                    {u.itemName}: {u.quantity} {u.unit}
                    {" "}— <span className="text-success">{labels.stockReturned}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 3: Re-apply */}
          {hasReapply && activeRows.length > 0 && (
            <div className="rounded-[10px] border border-accent/20 bg-accent/5 px-3 py-2" data-e2e-marker="audit-reapply-step">
              <p className="text-xs font-medium text-accent">
                ↓ {labels.auditReapplied}
                {activeRows[0]?.createdAt && (
                  <span className="ml-2 font-normal text-text-secondary">
                    {formatDate(activeRows[0].createdAt)}
                  </span>
                )}
                {activeRows[0]?.createdByName && (
                  <span className="ml-2 font-normal text-text-secondary">
                    · {activeRows[0].createdByName}
                  </span>
                )}
              </p>
              <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-text-secondary">
                {activeRows.map((u) => (
                  <li key={u.id}>
                    {u.itemName}: {u.quantity} {u.unit}
                    {u.unit !== u.baseUnit && ` (= ${u.baseQuantity} ${u.baseUnit})`}
                    {" "}— <span className="text-warning">{labels.stockDeducted}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* apply form — only if canManage, not yet applied, and templates exist */}
      {canManage && !hasNonSkipped && templates.length > 0 && (
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
