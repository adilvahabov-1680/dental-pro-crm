import { Stethoscope } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TreatmentItemCard } from "@/components/treatments/TreatmentItemCard";
import type { TreatmentItemFull } from "@/lib/treatments";

export function TreatmentItemsList({
  items,
  canManage,
  statusOptions,
  labels,
  empty,
  showPatient = false,
  materialsLabel,
  consumablesLabel,
  consumableStatusBadges,
  followUpLabel,
}: {
  items: TreatmentItemFull[];
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  labels: { tooth: string };
  empty: { title: string; desc: string };
  showPatient?: boolean;
  materialsLabel?: string;
  consumablesLabel?: string;
  /** per-item consumable status badge keyed by treatmentItemId */
  consumableStatusBadges?: Record<string, { label: string; tone: "applied" | "reversed" | "reapplied" }>;
  followUpLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={Stethoscope} title={empty.title} description={empty.desc} />
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TreatmentItemCard
          key={item.id}
          item={item}
          canManage={canManage}
          statusOptions={statusOptions}
          labels={labels}
          showPatient={showPatient}
          materialsLabel={materialsLabel}
          consumablesLabel={consumablesLabel}
          consumableStatusBadge={consumableStatusBadges?.[item.id]}
          followUpLabel={followUpLabel}
        />
      ))}
    </div>
  );
}
