import { CalendarOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppointmentCard } from "@/components/appointments/AppointmentCard";
import type { AppointmentListItem } from "@/lib/appointments";

export function AppointmentsList({
  items,
  canManage,
  statusOptions,
  labels,
  empty,
  showDate = false,
  addTreatmentLabel,
}: {
  items: AppointmentListItem[];
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  labels: { min: string; openPatient: string; chart: string; complaint: string };
  empty: { title: string; desc: string };
  showDate?: boolean;
  addTreatmentLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarOff} title={empty.title} description={empty.desc} />
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <AppointmentCard
          key={a.id}
          appointment={a}
          canManage={canManage}
          statusOptions={statusOptions}
          labels={labels}
          showDate={showDate}
          addTreatmentLabel={addTreatmentLabel}
        />
      ))}
    </div>
  );
}
