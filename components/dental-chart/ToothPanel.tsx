"use client";

import { useActionState } from "react";
import Link from "next/link";
import { X, History, ArrowRight, Lock, Stethoscope, Plus } from "lucide-react";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { toothStyle } from "@/components/dental-chart/status-styles";
import { updateToothRecord } from "@/lib/actions/dental-chart";
import type { ToothFormState } from "@/lib/validation/dental-chart";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

export interface ToothPanelRecord {
  id: string;
  patientId: string;
  toothNumber: number;
  status: string;
  priority: string;
  diagnosis: string | null;
  doctorNotes: string | null;
  lastTreatedAt: string | null;
  doctorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToothPanelHistoryItem {
  id: string;
  previousStatus: string | null;
  newStatus: string | null;
  diagnosis: string | null;
  procedureDone: string | null;
  doctorNote: string | null;
  changedByName: string;
  createdAt: string;
}

interface Labels {
  tooth: string;
  quadrant: string;
  status: string;
  priority: string;
  diagnosis: string;
  doctorNotes: string;
  procedure: string;
  lastTreated: string;
  doctor: string;
  created: string;
  updated: string;
  historyTitle: string;
  historyEmpty: string;
  historyBy: string;
  save: string;
  saving: string;
  saved: string;
  close: string;
  readOnly: string;
  errorGeneric: string;
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toothStyle(status).pill,
      )}
    >
      <span className={cn("size-1.5 rounded-full", toothStyle(status).dot)} />
      {label}
    </span>
  );
}

export function ToothPanel({
  record,
  quadrantLabel,
  statusOptions,
  priorityOptions,
  statusLabels,
  history,
  canManage,
  labels,
  closeHref,
  lastTreatments = [],
  newTreatmentHref = null,
  treatmentLabels,
}: {
  record: ToothPanelRecord;
  quadrantLabel: string;
  statusOptions: Option[];
  priorityOptions: Option[];
  statusLabels: Record<string, string>;
  history: ToothPanelHistoryItem[];
  canManage: boolean;
  labels: Labels;
  closeHref: string;
  /** последние процедуры по зубу (read-only; treatment ≠ tooth_history) */
  lastTreatments?: Array<{ id: string; date: string; service: string; status: string; price: string }>;
  /** ссылка «Yeni müalicə» (null = нет treatments.manage) */
  newTreatmentHref?: string | null;
  treatmentLabels?: { title: string; empty: string; new: string };
}) {
  const [state, formAction, pending] = useActionState<ToothFormState | undefined, FormData>(
    updateToothRecord,
    undefined,
  );
  const style = toothStyle(record.status);

  return (
    <>
      {/* backdrop */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label={labels.close}
        className="fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-[2px]"
      />
      {/* slide-over */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-subtle bg-bg-surface shadow-[0_8px_40px_rgb(0_0_0/0.45)]">
        {/* шапка зуба */}
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-xl bg-bg-elevated",
                style.icon,
              )}
            >
              <ToothIcon className="size-7" />
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-text-primary">
                {labels.tooth} {record.toothNumber}
              </p>
              <p className="text-xs text-text-secondary">
                {labels.quadrant}: {quadrantLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={record.status} label={statusLabels[record.status] ?? record.status} />
            <Link
              href={closeHref}
              scroll={false}
              className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* метаданные */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-text-secondary">
            <p>
              {labels.lastTreated}:{" "}
              <span className="text-text-primary">{record.lastTreatedAt ?? "—"}</span>
            </p>
            <p>
              {labels.doctor}: <span className="text-text-primary">{record.doctorName ?? "—"}</span>
            </p>
            <p>
              {labels.created}: <span className="text-text-primary">{record.createdAt}</span>
            </p>
            <p>
              {labels.updated}: <span className="text-text-primary">{record.updatedAt}</span>
            </p>
          </div>

          {canManage ? (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="toothRecordId" value={record.id} />
              <input type="hidden" name="patientId" value={record.patientId} />
              <div className="grid grid-cols-2 gap-3">
                <Select id="status" name="status" label={labels.status} defaultValue={record.status}>
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select
                  id="priority"
                  name="priority"
                  label={labels.priority}
                  defaultValue={record.priority}
                >
                  {priorityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                id="diagnosis"
                name="diagnosis"
                label={labels.diagnosis}
                defaultValue={record.diagnosis ?? ""}
              />
              <Textarea
                id="doctorNotes"
                name="doctorNotes"
                label={labels.doctorNotes}
                defaultValue={record.doctorNotes ?? ""}
              />
              <Input id="procedureDone" name="procedureDone" label={labels.procedure} />
              {state?.error && (
                <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {labels.errorGeneric}
                </p>
              )}
              {state?.ok && !pending && (
                <p className="rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  {labels.saved}
                </p>
              )}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? labels.saving : labels.save}
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 text-xs text-text-secondary">
              <Lock className="size-3.5 shrink-0" /> {labels.readOnly}
            </p>
          )}

          {/* процедуры по зубу (модуль Müalicə; не путать с историей статусов) */}
          {treatmentLabels && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Stethoscope className="size-4 text-accent" /> {treatmentLabels.title}
                </h3>
                {newTreatmentHref && (
                  <Link
                    href={newTreatmentHref}
                    className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-accent/10 px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    <Plus className="size-3.5" /> {treatmentLabels.new}
                  </Link>
                )}
              </div>
              {lastTreatments.length === 0 ? (
                <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2.5 text-center text-xs text-text-secondary">
                  {treatmentLabels.empty}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {lastTreatments.map((tr) => (
                    <li
                      key={tr.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 text-xs"
                    >
                      <span className="tabular-nums text-text-secondary">{tr.date}</span>
                      <span className="min-w-0 flex-1 truncate text-text-primary">{tr.service}</span>
                      <span className="tabular-nums font-medium text-text-primary">{tr.price}</span>
                      <span className="text-text-secondary">{tr.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* история — append-only лента */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <History className="size-4 text-accent" /> {labels.historyTitle}
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
                {history.length}
              </span>
            </h3>
            {history.length === 0 ? (
              <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
                {labels.historyEmpty}
              </p>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-[10px] border border-border-subtle bg-bg-base/50 p-3"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {h.previousStatus && (
                        <StatusPill
                          status={h.previousStatus}
                          label={statusLabels[h.previousStatus] ?? h.previousStatus}
                        />
                      )}
                      <ArrowRight className="size-3 text-text-secondary" />
                      {h.newStatus && (
                        <StatusPill
                          status={h.newStatus}
                          label={statusLabels[h.newStatus] ?? h.newStatus}
                        />
                      )}
                    </div>
                    {h.diagnosis && (
                      <p className="text-xs text-text-primary">{h.diagnosis}</p>
                    )}
                    {h.procedureDone && (
                      <p className="text-xs text-accent">{h.procedureDone}</p>
                    )}
                    {h.doctorNote && (
                      <p className="text-xs text-text-secondary">{h.doctorNote}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-text-secondary/70">
                      {h.createdAt} · {h.changedByName} {labels.historyBy}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
