import { CalendarOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppointmentCard } from "@/components/appointments/AppointmentCard";
import type { AppointmentListItem } from "@/lib/appointments";

/** День: приёмы, сгруппированные по часам, с колонкой времени. */
export function CalendarDayView({
  items,
  canManage,
  statusOptions,
  labels,
  empty,
  addTreatmentLabel,
}: {
  items: AppointmentListItem[];
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  labels: { min: string; openPatient: string; chart: string; complaint: string };
  empty: { title: string; desc: string };
  addTreatmentLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarOff} title={empty.title} description={empty.desc} />
      </Card>
    );
  }

  const byHour = new Map<number, AppointmentListItem[]>();
  for (const a of items) {
    const h = new Date(a.startsAt).getHours();
    byHour.set(h, [...(byHour.get(h) ?? []), a]);
  }
  const hours = [...byHour.keys()].sort((x, y) => x - y);

  return (
    <div className="space-y-3">
      {hours.map((h) => (
        <div key={h} className="flex gap-3">
          <div className="w-12 shrink-0 pt-3 text-right text-xs font-medium tabular-nums text-text-secondary">
            {String(h).padStart(2, "0")}:00
          </div>
          <div className="relative flex-1 space-y-2 border-l border-border-subtle pl-3">
            <span className="absolute -left-px top-4 h-2 w-px bg-accent" />
            {byHour.get(h)!.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                canManage={canManage}
                statusOptions={statusOptions}
                labels={labels}
                addTreatmentLabel={addTreatmentLabel}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
