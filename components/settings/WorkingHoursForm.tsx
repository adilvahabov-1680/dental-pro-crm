"use client";

import { useActionState, useState } from "react";
import { updateWorkingHours } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { WEEK_DAYS, type WorkingHours } from "@/lib/validation/settings";
import type { SettingsFormState } from "@/lib/validation/settings";
import type { Dict } from "@/i18n/az";

export function WorkingHoursForm({
  dict,
  hours,
  canManage,
}: {
  dict: Dict["settings"];
  hours: WorkingHours;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState | undefined, FormData>(
    updateWorkingHours,
    undefined,
  );
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(WEEK_DAYS.map((d) => [d, hours[d] !== null])),
  );
  const f = dict.hours;

  const timeCls =
    "h-9 rounded-[10px] border border-border-subtle bg-bg-base/60 px-2 text-sm text-text-primary " +
    "outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-40";

  return (
    <form action={formAction}>
      <fieldset disabled={!canManage} className="space-y-4">
        <div className="divide-y divide-border-subtle/50">
          {WEEK_DAYS.map((day) => {
            const dayErr = state?.fieldErrors?.[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3 py-2">
                <label className="flex w-44 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    name={`enabled_${day}`}
                    checked={enabled[day]}
                    onChange={(e) => setEnabled((s) => ({ ...s, [day]: e.target.checked }))}
                    className="size-4 accent-accent"
                  />
                  <span className="text-sm text-text-primary">{f.days[day]}</span>
                </label>
                {enabled[day] ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      name={`from_${day}`}
                      defaultValue={hours[day]?.from ?? "09:00"}
                      aria-label={`${f.days[day]} — ${f.from}`}
                      className={timeCls}
                    />
                    <span className="text-text-secondary">—</span>
                    <input
                      type="time"
                      name={`to_${day}`}
                      defaultValue={hours[day]?.to ?? "18:00"}
                      aria-label={`${f.days[day]} — ${f.to}`}
                      className={timeCls}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-text-secondary">{f.closed}</span>
                )}
                {dayErr && (
                  <span className="text-xs text-danger">
                    {dict.errors[dayErr as keyof typeof dict.errors] ?? dict.errors.generic}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {state?.error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
          </p>
        )}

        {canManage && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? dict.saving : dict.save}
            </Button>
            {state?.saved && !pending && <span className="text-sm text-success">{dict.saved}</span>}
          </div>
        )}
      </fieldset>
    </form>
  );
}
