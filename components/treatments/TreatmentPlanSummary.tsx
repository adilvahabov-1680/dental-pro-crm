import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TreatmentPlanStatusBadge } from "@/components/treatments/TreatmentStatusBadge";
import { formatMoney } from "@/lib/utils";

export function TreatmentPlanSummary({
  plan,
  labels,
}: {
  plan: { id: string; title: string; status: string; totalPrice: number; itemsCount: number };
  labels: { items: string; total: string };
}) {
  return (
    <Card className="flex flex-wrap items-center gap-3 border-accent/20 bg-accent/5 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <ClipboardList className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-primary">{plan.title}</p>
        <p className="text-xs tabular-nums text-text-secondary">
          {plan.itemsCount} {labels.items}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold tabular-nums text-accent">
          {labels.total}: {formatMoney(plan.totalPrice)}
        </span>
        <TreatmentPlanStatusBadge status={plan.status} />
      </div>
    </Card>
  );
}
