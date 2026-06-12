"use client";

import { useActionState } from "react";
import { toggleServiceActive, updateServicePrice } from "@/lib/actions/settings";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatMoney } from "@/lib/utils";
import type { SettingsFormState } from "@/lib/validation/settings";
import type { Dict } from "@/i18n/az";

export interface ServiceRow {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number | null;
  isChildService: boolean;
  isActive: boolean;
  price: number | null;
  childPrice: number | null;
  priceValidFrom: string | null; // ISO — клиентскому компоненту Date не передаём
}

function moneyToInput(qepik: number | null): string {
  return qepik === null ? "" : (qepik / 100).toFixed(2);
}

const inputCls =
  "h-9 w-24 rounded-[10px] border border-border-subtle bg-bg-base/60 px-2 text-right text-sm " +
  "tabular-nums text-text-primary outline-none transition-colors focus:border-accent " +
  "focus:ring-2 focus:ring-accent/30";

/** Inline-форма смены цены (отдельный $ACTION на строку). */
function PriceForm({ row, dict }: { row: ServiceRow; dict: Dict["settings"] }) {
  const [state, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    updateServicePrice,
    undefined,
  );
  const tt = dict.services.table;
  const fieldErr = state?.fieldErrors ? Object.values(state.fieldErrors)[0] : undefined;
  const errKey = state?.error ?? fieldErr;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" data-svc={row.id}>
      <input type="hidden" name="serviceId" value={row.id} />
      <input
        name="price"
        inputMode="decimal"
        defaultValue={moneyToInput(row.price)}
        placeholder="0.00"
        aria-label={tt.price}
        className={inputCls}
      />
      <input
        name="childPrice"
        inputMode="decimal"
        defaultValue={moneyToInput(row.childPrice)}
        placeholder={tt.childPrice}
        aria-label={tt.childPrice}
        className={inputCls}
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-[10px] border border-accent/40 bg-accent/10 px-3 text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {pending ? tt.updating : tt.update}
      </button>
      {state?.saved && !pending && <span className="text-xs text-success">{dict.saved}</span>}
      {errKey && (
        <span className="text-xs text-danger">
          {dict.errors[errKey as keyof typeof dict.errors] ?? dict.errors.generic}
        </span>
      )}
    </form>
  );
}

function ToggleForm({ row, dict }: { row: ServiceRow; dict: Dict["settings"] }) {
  const [, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    toggleServiceActive,
    undefined,
  );
  const tt = dict.services.table;
  return (
    <form action={formAction} data-svc-toggle={row.id}>
      <input type="hidden" name="serviceId" value={row.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline disabled:opacity-50"
      >
        {row.isActive ? tt.deactivate : tt.activate}
      </button>
    </form>
  );
}

export function ServicesTable({
  dict,
  rows,
  canManage,
}: {
  dict: Dict["settings"];
  rows: ServiceRow[];
  canManage: boolean;
}) {
  const tt = dict.services.table;
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-text-secondary">{dict.services.empty}</p>;
  }

  return (
    <div className="divide-y divide-border-subtle/50">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`flex flex-wrap items-center justify-between gap-3 py-3 ${row.isActive ? "" : "opacity-55"}`}
        >
          <div className="min-w-48">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-primary">{row.name}</p>
              {row.isChildService && <Badge tone="info">{tt.childBadge}</Badge>}
              {!row.isActive && <Badge tone="neutral">{tt.inactive}</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {row.categoryName ?? "—"}
              {row.durationMin ? ` · ${row.durationMin} ${tt.min}` : ""}
              {row.priceValidFrom ? ` · ${tt.validFrom}: ${formatDate(row.priceValidFrom)}` : ""}
            </p>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-4">
              <PriceForm row={row} dict={dict} />
              <ToggleForm row={row} dict={dict} />
            </div>
          ) : (
            <p className="text-sm tabular-nums text-text-primary">
              {row.price !== null ? formatMoney(row.price) : tt.noPrice}
              {row.childPrice !== null && (
                <span className="ml-2 text-text-secondary">
                  {tt.childPrice}: {formatMoney(row.childPrice)}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
