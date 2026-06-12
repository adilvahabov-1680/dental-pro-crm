"use client";

import { useActionState } from "react";
import { addPayment } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { FinanceFormState } from "@/lib/validation/finance";

export function PaymentForm({
  invoiceId,
  maxAmount,
  methods,
  labels,
  errors,
}: {
  invoiceId: string;
  /** остаток в гяпиках (для подсказки/преселекта) */
  maxAmount: number;
  methods: Array<{ value: string; label: string }>;
  labels: { title: string; amount: string; method: string; paidAt: string; note: string; save: string; saving: string };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<FinanceFormState | undefined, FormData>(
    addPayment,
    undefined,
  );
  const err = (key: string) =>
    state?.fieldErrors?.[key] ? errors[state.fieldErrors[key]] ?? errors.generic : undefined;

  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{labels.title}</h3>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="amount"
          name="amount"
          label={labels.amount}
          required
          inputMode="decimal"
          defaultValue={(maxAmount / 100).toFixed(2)}
          error={err("amount")}
        />
        <Select id="method" name="method" label={labels.method} defaultValue="cash">
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Input id="paidAt" name="paidAt" type="date" label={labels.paidAt} />
        <Input id="note" name="note" label={labels.note} />
      </div>
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
