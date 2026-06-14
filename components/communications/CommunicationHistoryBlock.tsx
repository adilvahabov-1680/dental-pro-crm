import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { LogCommunicationForm } from "@/components/communications/LogCommunicationForm";
import {
  CommunicationChannelBadge,
  CommunicationTypeBadge,
} from "@/components/communications/CommunicationTypeBadge";
import type { CommunicationRow } from "@/lib/communications";

function fmtDateTime(dt: Date): string {
  return `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Блок «Əlaqə tarixçəsi» на карточке пациента (сессия 15). */
export function CommunicationHistoryBlock({
  patientId,
  rows,
  canManage,
  channelOptions,
  labels,
  errors,
}: {
  patientId: string;
  rows: CommunicationRow[];
  canManage: boolean;
  channelOptions: Array<{ value: string; label: string }>;
  labels: {
    title: string;
    empty: string;
    channel: string;
    type: string;
    message: string;
    createdBy: string;
    messagePlaceholder: string;
    submit: string;
    saving: string;
    success: string;
  };
  errors: Record<string, string>;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
        <MessageSquare className="size-4" /> {labels.title}
        {rows.length > 0 && (
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
            {rows.length}
          </span>
        )}
      </h2>
      {canManage && (
        <LogCommunicationForm
          patientId={patientId}
          channelOptions={channelOptions}
          labels={labels}
          errors={errors}
        />
      )}
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title={labels.empty} />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CommunicationChannelBadge channel={r.channel} />
                  <CommunicationTypeBadge type={r.type} />
                </div>
                <span className="text-[11px] tabular-nums text-text-secondary">
                  {fmtDateTime(r.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-text-primary">{r.body}</p>
              <p className="mt-1 text-[11px] text-text-secondary">
                {labels.createdBy}: {r.createdBy?.fullName ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
