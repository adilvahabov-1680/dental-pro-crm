"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createInvoice } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ToothIcon } from "@/components/ui/ToothIcon";
import type { FinanceFormState } from "@/lib/validation/finance";
import { cn } from "@/lib/utils";

interface BillableOption {
  id: string;
  service: string;
  toothNumber: number | null;
  doctor: string;
  date: string;
  /** qəpik после скидки */
  amount: number;
}

export function InvoiceCreateForm({
  patientId,
  items,
  labels,
  errors,
  cancelHref,
}: {
  patientId: string;
  items: BillableOption[];
  labels: {
    noBillable: string;
    selectedTotal: string;
    notes: string;
    save: string;
    saving: string;
    cancel: string;
  };
  errors: Record<string, string>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<FinanceFormState | undefined, FormData>(
    createInvoice,
    undefined,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map((i) => i.id)));

  const total = useMemo(
    () => items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.amount, 0),
    [items, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border-subtle bg-bg-surface/80 px-4 py-6 text-center text-sm text-text-secondary">
        {labels.noBillable}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border-subtle bg-bg-surface/80 p-5"
    >
      <input type="hidden" name="patientId" value={patientId} />

      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
                selected.has(it.id)
                  ? "border-accent/40 bg-accent/5"
                  : "border-border-subtle bg-bg-base/50 hover:bg-bg-elevated/50",
              )}
            >
              <input
                type="checkbox"
                name="itemIds"
                value={it.id}
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                className="size-4 cursor-pointer accent-[#22d3ee]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                  {it.service}
                  {it.toothNumber && (
                    <span className="inline-flex items-center gap-1 text-xs text-accent">
                      <ToothIcon className="size-3.5" /> {it.toothNumber}
                    </span>
                  )}
                </span>
                <span className="text-xs text-text-secondary">
                  {it.date} · {it.doctor}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                {(it.amount / 100).toFixed(2)} ₼
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Textarea id="notes" name="notes" label={labels.notes} />

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {labels.selectedTotal}:{" "}
          <span className="text-base font-semibold tabular-nums text-accent">
            {(total / 100).toFixed(2)} ₼
          </span>
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={cancelHref}
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {labels.cancel}
          </Link>
          <Button type="submit" disabled={pending || selected.size === 0}>
            {pending ? labels.saving : labels.save}
          </Button>
        </div>
      </div>
    </form>
  );
}
