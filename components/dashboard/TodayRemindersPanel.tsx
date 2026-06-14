import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { prepareAppointmentReminder } from "@/lib/actions/communications";
import type { ReminderCandidate } from "@/lib/communications";

/** Панель «Bugünkü xatırlatmalar» на dashboard (сессия 15). */
export function TodayRemindersPanel({
  candidates,
  labels,
  errors,
}: {
  candidates: ReminderCandidate[];
  labels: {
    title: string;
    empty: string;
    alreadyPrepared: string;
    action: string;
    prepared: string;
    noPhone: string;
  };
  errors: Record<string, string>;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="size-4 text-accent" /> {labels.title}
          {candidates.length > 0 && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {candidates.length}
            </span>
          )}
        </h2>
      </div>
      {candidates.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li
              key={c.appointmentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
            >
              <Link
                href={`/patients/${c.patientId}`}
                className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-accent"
              >
                <span className="text-sm font-medium tabular-nums text-accent">
                  {new Date(c.startsAt).toLocaleTimeString("az-AZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {c.patientName}
                </span>
                <span className="hidden text-xs text-text-secondary sm:inline">
                  {c.doctorName}
                </span>
              </Link>
              {c.alreadyPrepared && <Badge tone="success">{labels.alreadyPrepared}</Badge>}
              <WhatsAppActionButton
                action={prepareAppointmentReminder}
                hiddenName="appointmentId"
                hiddenValue={c.appointmentId}
                label={labels.action}
                preparedLabel={labels.prepared}
                noPhoneLabel={labels.noPhone}
                errors={errors}
                hasPhone={!!c.phone}
                small
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
