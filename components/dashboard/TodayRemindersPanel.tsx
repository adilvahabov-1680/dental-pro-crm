import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { prepareAppointmentReminder } from "@/lib/actions/communications";
import type { ReminderCandidate, ReminderQueue, ReminderStatus } from "@/lib/communications";

type GroupKey = "due" | "prepared" | "responded";

const RESPONDED_BADGE_KEY: Partial<Record<ReminderStatus, "confirmed" | "late" | "reschedule" | "cancelled">> = {
  responded_confirmed: "confirmed",
  responded_late: "late",
  responded_reschedule: "reschedule",
  responded_cancelled: "cancelled",
};

const STATUS_TONE: Record<ReminderStatus, "warning" | "success" | "accent" | "neutral"> = {
  due: "warning",
  prepared: "success",
  responded_confirmed: "accent",
  responded_late: "warning",
  responded_reschedule: "warning",
  responded_cancelled: "neutral",
};

function groupOf(status: ReminderStatus): GroupKey {
  if (status === "due") return "due";
  if (status === "prepared") return "prepared";
  return "responded";
}

interface ReminderLabels {
  title: string;
  empty: string;
  windowLabel: string;
  noAutoSend: string;
  notDue: string;
  groups: { due: string; prepared: string; responded: string };
  badges: {
    due: string;
    prepared: string;
    confirmed: string;
    late: string;
    reschedule: string;
    cancelled: string;
  };
  action: string;
  prepared: string;
  noPhone: string;
  /** сессия 43: индикатор для responded_reschedule, если reschedule_offer-ссылка уже готовилась. */
  rescheduleOptionsSent: string;
}

/** Панель «Qəbul xatırlatmaları» на dashboard (сессия 15, v2 — сессия 42). */
export function TodayRemindersPanel({
  queue,
  labels,
  errors,
}: {
  queue: ReminderQueue;
  labels: ReminderLabels;
  errors: Record<string, string>;
}) {
  const { candidates, reminderHoursBefore, notDueCount } = queue;
  const groups: Record<GroupKey, ReminderCandidate[]> = { due: [], prepared: [], responded: [] };
  for (const c of candidates) groups[groupOf(c.status)].push(c);

  const fmtTime = (dt: Date) =>
    new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });

  const badgeText = (status: ReminderStatus): string => {
    if (status === "due") return labels.badges.due;
    if (status === "prepared") return labels.badges.prepared;
    const key = RESPONDED_BADGE_KEY[status];
    return key ? labels.badges[key] : status;
  };

  const renderRow = (c: ReminderCandidate) => (
    <li
      key={c.appointmentId}
      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
    >
      <Link
        href={`/patients/${c.patientId}`}
        className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-accent"
      >
        <span className="text-sm font-medium tabular-nums text-accent">{fmtTime(c.startsAt)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{c.patientName}</span>
        <span className="hidden text-xs text-text-secondary sm:inline">{c.doctorName}</span>
      </Link>
      <Badge tone={STATUS_TONE[c.status]}>{badgeText(c.status)}</Badge>
      {c.status === "responded_reschedule" && c.rescheduleOptionsSent && (
        <span className="text-[11px] text-success">{labels.rescheduleOptionsSent}</span>
      )}
      {groupOf(c.status) !== "responded" && (
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
      )}
    </li>
  );

  const sections: Array<{ key: GroupKey; title: string }> = [
    { key: "due", title: labels.groups.due },
    { key: "prepared", title: labels.groups.prepared },
    { key: "responded", title: labels.groups.responded },
  ];

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="size-4 text-accent" /> {labels.title}
          {candidates.length > 0 && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {candidates.length}
            </span>
          )}
        </h2>
      </div>
      <p className="mb-3 text-[11px] text-text-secondary">
        {labels.windowLabel}: {reminderHoursBefore} saat · {labels.noAutoSend}
      </p>
      {candidates.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map(
            (s) =>
              groups[s.key].length > 0 && (
                <div key={s.key}>
                  <h3 className="mb-1.5 text-xs font-medium text-text-secondary">{s.title}</h3>
                  <ul className="space-y-1.5">{groups[s.key].map(renderRow)}</ul>
                </div>
              ),
          )}
        </div>
      )}
      {notDueCount > 0 && (
        <p className="mt-3 text-[11px] text-text-secondary">
          +{notDueCount} {labels.notDue}
        </p>
      )}
    </Card>
  );
}
