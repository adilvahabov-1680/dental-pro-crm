import Link from "next/link";
import { Stethoscope, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TreatmentItemCard } from "@/components/treatments/TreatmentItemCard";
import { TreatmentPlanSummary } from "@/components/treatments/TreatmentPlanSummary";
import type { TreatmentItemFull } from "@/lib/treatments";
import { formatMoney } from "@/lib/utils";
import type { Dict } from "@/i18n/az";

/** Живой блок «Müalicə» на карточке пациента. */
export function PatientTreatmentBlock({
  patientId,
  dict,
  items,
  activePlan,
  total,
  activeAmount,
  doneAmount,
  canManage,
  statusOptions,
}: {
  patientId: string;
  dict: Dict["treatments"];
  items: TreatmentItemFull[];
  activePlan: { id: string; title: string; status: string; totalPrice: number; itemsCount: number } | null;
  total: number;
  activeAmount: number;
  doneAmount: number;
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Stethoscope className="size-4" /> {dict.patientBlock.title}
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
            {total}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link
              href={`/patients/${patientId}/treatments/new`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-linear-to-br from-accent to-accent-deep px-3 text-xs font-semibold text-bg-base transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" /> {dict.new}
            </Link>
          )}
          <Link
            href={`/patients/${patientId}/treatments`}
            className="text-xs text-text-secondary transition-colors hover:text-accent"
          >
            {dict.all} →
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
          {dict.patientBlock.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {activePlan && (
            <TreatmentPlanSummary
              plan={activePlan}
              labels={{ items: dict.plan.items, total: dict.plan.total }}
            />
          )}
          <div className="space-y-2">
            {items.slice(0, 3).map((item) => (
              <TreatmentItemCard
                key={item.id}
                item={item}
                canManage={canManage}
                statusOptions={statusOptions}
                labels={{ tooth: dict.card.tooth }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border-subtle pt-3 text-xs text-text-secondary">
            <span>
              {dict.patientBlock.totalActive}:{" "}
              <span className="font-semibold tabular-nums text-text-primary">
                {formatMoney(activeAmount)}
              </span>
            </span>
            <span>
              {dict.patientBlock.totalDone}:{" "}
              <span className="font-semibold tabular-nums text-success">
                {formatMoney(doneAmount)}
              </span>
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
