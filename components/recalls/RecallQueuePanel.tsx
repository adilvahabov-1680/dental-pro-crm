import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { RecallStatusBadge } from "@/components/recalls/RecallStatusBadge";
import { RecallSimpleActionButton } from "@/components/recalls/RecallSimpleActionButton";
import { prepareRecallMessageAction, markRecallScheduledAction, dismissRecallAction } from "@/lib/actions/recall-tasks";
import { classifyRecallUrgency, type RecallTaskFull } from "@/lib/recall-tasks";
import { formatDate } from "@/lib/utils";

interface Labels {
  title: string;
  empty: string;
  overdue: string;
  dueSoon: string;
  noAutoSend: string;
  noAutoAppointment: string;
  whatsappAction: string;
  whatsappPrepared: string;
  noPhone: string;
  markScheduled: string;
  markScheduledDone: string;
  dismiss: string;
  dismissDone: string;
}

/** Recall-очередь «Kontrol xatırlatmaları» (сессия 44) — pending/prepared, по dueDate. */
export function RecallQueuePanel({
  queue,
  canManage,
  labels,
  errors,
}: {
  queue: RecallTaskFull[];
  canManage: boolean;
  labels: Labels;
  errors: Record<string, string>;
}) {
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="size-4 text-accent" /> {labels.title}
          {queue.length > 0 && (
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {queue.length}
            </span>
          )}
        </h2>
      </div>
      <p className="mb-3 text-[11px] text-text-secondary">
        {labels.noAutoSend} · {labels.noAutoAppointment}
      </p>

      {queue.length === 0 ? (
        <EmptyState icon={BellRing} title={labels.empty} />
      ) : (
        <ul className="space-y-1.5">
          {queue.map((r) => {
            const urgency = classifyRecallUrgency(r.dueDate);
            return (
              <li
                key={r.id}
                data-e2e-marker={`recall-row-${r.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium tabular-nums text-accent">
                      {formatDate(r.dueDate)}
                    </span>
                    {urgency === "overdue" && <Badge tone="danger">{labels.overdue}</Badge>}
                    {urgency === "due_soon" && <Badge tone="warning">{labels.dueSoon}</Badge>}
                    <RecallStatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-text-primary">{r.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                    <Link href={`/patients/${r.patient.id}`} className="transition-colors hover:text-accent">
                      {r.patient.lastName} {r.patient.firstName}
                    </Link>
                    {r.doctor && <span>{r.doctor.user.fullName}</span>}
                  </p>
                  {r.note && <p className="mt-0.5 text-xs text-text-secondary/80">{r.note}</p>}
                </div>

                {canManage && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <WhatsAppActionButton
                      action={prepareRecallMessageAction}
                      hiddenName="recallTaskId"
                      hiddenValue={r.id}
                      label={labels.whatsappAction}
                      preparedLabel={labels.whatsappPrepared}
                      noPhoneLabel={labels.noPhone}
                      errors={errors}
                      hasPhone={!!r.patient.phone}
                      small
                    />
                    <RecallSimpleActionButton
                      action={markRecallScheduledAction}
                      recallTaskId={r.id}
                      label={labels.markScheduled}
                      doneLabel={labels.markScheduledDone}
                      errors={errors}
                    />
                    <RecallSimpleActionButton
                      action={dismissRecallAction}
                      recallTaskId={r.id}
                      label={labels.dismiss}
                      doneLabel={labels.dismissDone}
                      errors={errors}
                      tone="danger"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
