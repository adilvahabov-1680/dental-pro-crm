import Link from "next/link";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackRatingBadge } from "@/components/feedback/FeedbackRatingBadge";
import { formatDate } from "@/lib/utils";
import type { PatientFeedbackFull } from "@/lib/patient-feedback";

function fmtDateTime(dt: Date): string {
  return `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Блок «Son rəylər» — на карточке пациента (сессия 45) и переиспользуется на /feedback. */
export function PatientFeedbackBlock({
  rows,
  showPatient = false,
  labels,
}: {
  rows: PatientFeedbackFull[];
  showPatient?: boolean;
  labels: { title: string; empty: string };
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
        <Star className="size-4" /> {labels.title}
        {rows.length > 0 && (
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
            {rows.length}
          </span>
        )}
      </h2>
      {rows.length === 0 ? (
        <EmptyState icon={Star} title={labels.empty} />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const doctorName = r.appointment?.doctor.user.fullName ?? r.treatmentItem?.doctor.user.fullName;
            const subject = r.treatmentItem?.service.name ?? (r.appointment ? fmtDateTime(r.appointment.startsAt) : null);
            return (
              <li
                key={r.id}
                data-e2e-marker={`feedback-row-${r.id}`}
                className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FeedbackRatingBadge rating={r.rating} />
                  <span className="text-[11px] tabular-nums text-text-secondary">
                    {fmtDateTime(r.submittedAt)}
                  </span>
                </div>
                {showPatient && (
                  <Link
                    href={`/patients/${r.patient.id}`}
                    className="mt-1 block text-xs font-medium text-text-primary transition-colors hover:text-accent"
                  >
                    {r.patient.lastName} {r.patient.firstName}
                  </Link>
                )}
                {r.comment && <p className="mt-1.5 text-xs text-text-primary">{r.comment}</p>}
                {(subject || doctorName) && (
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {subject}
                    {subject && doctorName && " · "}
                    {doctorName}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
