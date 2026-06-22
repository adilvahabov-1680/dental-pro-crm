import Link from "next/link";
import { Clock, Phone, User, Stethoscope } from "lucide-react";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentStatusBadge";
import { AppointmentStatusControl } from "@/components/appointments/AppointmentStatusControl";
import type { AppointmentListItem } from "@/lib/appointments";
import { cn } from "@/lib/utils";

function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
}

export function durationMin(a: { startsAt: Date; endsAt: Date }): number {
  return Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000);
}

export function AppointmentCard({
  appointment: a,
  canManage,
  statusOptions,
  labels,
  showDate = false,
  addTreatmentLabel,
}: {
  appointment: AppointmentListItem;
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  labels: { min: string; openPatient: string; chart: string; complaint: string };
  showDate?: boolean;
  /** метка «Müalicə əlavə et» — рендерит ссылку при treatments.manage */
  addTreatmentLabel?: string;
}) {
  const muted = ["cancelled", "late_cancelled", "no_show"].includes(a.status);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3 transition-colors hover:border-accent/30",
        muted && "opacity-60",
      )}
    >
      {/* время */}
      <div className="flex w-24 shrink-0 flex-col items-center rounded-xl bg-bg-elevated/70 px-2 py-1.5">
        {showDate && (
          <span className="text-[10px] tabular-nums text-text-secondary">
            {new Date(a.startsAt).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-accent">
          <Clock className="size-3.5" /> {fmtTime(a.startsAt)}
        </span>
        <span className="text-[10px] tabular-nums text-text-secondary">
          {durationMin(a)} {labels.min}
        </span>
      </div>

      {/* пациент + врач + причина */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/patients/${a.patient.id}`}
          className="font-medium text-text-primary transition-colors hover:text-accent"
        >
          {a.patient.lastName} {a.patient.firstName}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
          {a.patient.phone && (
            <span className="flex items-center gap-1 tabular-nums">
              <Phone className="size-3" /> {a.patient.phone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <User className="size-3" /> {a.doctor.user.fullName}
          </span>
          {a.complaint && <span className="text-text-secondary/80">{a.complaint}</span>}
        </p>
      </div>

      {/* статус + действия */}
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <AppointmentStatusControl
            appointmentId={a.id}
            status={a.status}
            options={statusOptions}
          />
        ) : (
          <AppointmentStatusBadge status={a.status} />
        )}
        <Link
          href={`/patients/${a.patient.id}/dental-chart`}
          title={labels.chart}
          aria-label={labels.chart}
          className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
        >
          <ToothIcon className="size-4" />
        </Link>
        {addTreatmentLabel && (
          <Link
            href={`/patients/${a.patient.id}/treatments/new?appointmentId=${a.id}`}
            title={addTreatmentLabel}
            aria-label={addTreatmentLabel}
            className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
          >
            <Stethoscope className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
