import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentStatusBadge";
import type { DashboardAppointment } from "@/lib/dashboard";

export function TodayAppointmentsPanel({
  appointments,
  labels,
}: {
  appointments: DashboardAppointment[];
  labels: { title: string; empty: string; all: string };
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <CalendarDays className="size-4 text-accent" /> {labels.title}
          {appointments.length > 0 && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {appointments.length}
            </span>
          )}
        </h2>
        <Link
          href="/appointments"
          className="text-xs text-text-secondary transition-colors hover:text-accent"
        >
          {labels.all} →
        </Link>
      </div>
      {appointments.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/patients/${a.patient.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 transition-colors hover:bg-bg-elevated"
              >
                <span className="text-sm font-medium tabular-nums text-accent">
                  {new Date(a.startsAt).toLocaleTimeString("az-AZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {a.patient.lastName} {a.patient.firstName}
                </span>
                <span className="hidden text-xs text-text-secondary sm:inline">
                  {a.doctor.user.fullName}
                </span>
                <AppointmentStatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
