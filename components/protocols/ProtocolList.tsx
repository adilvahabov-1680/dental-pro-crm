"use client";

import { useActionState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { toggleProtocolActive, deleteProtocol, addProtocolStep, deleteProtocolStep } from "@/lib/actions/protocols";
import type { ProtocolWithSteps } from "@/lib/protocols";
import type { ProtocolFormState } from "@/lib/validation/protocols";

interface ServiceOption {
  id: string;
  name: string;
}

interface Labels {
  steps: string;
  stepsTitle: string;
  addStep: string;
  stepService: string;
  stepOrder: string;
  stepDuration: string;
  stepInterval: string;
  stepNotes: string;
  stepAdd: string;
  stepDelete: string;
  active: string;
  inactive: string;
  toggle: string;
  delete: string;
  empty: string;
  serviceNone: string;
  saved: string;
  error: string;
  serviceRequired: string;
}

function AddStepForm({
  protocolId,
  nextOrder,
  services,
  labels,
}: {
  protocolId: string;
  nextOrder: number;
  services: ServiceOption[];
  labels: Labels;
}) {
  const [state, action, pending] = useActionState<ProtocolFormState | undefined, FormData>(
    addProtocolStep,
    undefined,
  );

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-[10px] border border-border-subtle bg-bg-base p-3">
      <input type="hidden" name="protocolId" value={protocolId} />
      <input type="hidden" name="orderIndex" value={nextOrder} />

      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-xs text-text-secondary">{labels.stepService}</label>
        <select
          name="serviceId"
          required
          className="h-8 w-full rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">{labels.serviceNone}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="w-20">
        <label className="mb-1 block text-xs text-text-secondary">{labels.stepDuration}</label>
        <input
          name="durationMin"
          type="number"
          min={5}
          max={480}
          placeholder="30"
          className="h-8 w-full rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="w-20">
        <label className="mb-1 block text-xs text-text-secondary">{labels.stepInterval}</label>
        <input
          name="intervalDays"
          type="number"
          min={0}
          max={365}
          placeholder="0"
          className="h-8 w-full rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="min-w-[120px] flex-1">
        <label className="mb-1 block text-xs text-text-secondary">{labels.stepNotes}</label>
        <input
          name="notes"
          maxLength={500}
          className="h-8 w-full rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-8 items-center gap-1 rounded-[8px] bg-accent/10 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        <Plus className="size-3" />
        {labels.stepAdd}
      </button>

      {state?.fieldErrors?.serviceId && (
        <p className="w-full text-xs text-error">{labels.serviceRequired}</p>
      )}
    </form>
  );
}

function DeleteStepButton({ stepId, label }: { stepId: string; label: string }) {
  const [, action, pending] = useActionState<ProtocolFormState | undefined, FormData>(
    deleteProtocolStep,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="stepId" value={stepId} />
      <button
        type="submit"
        disabled={pending}
        title={label}
        className="flex size-6 items-center justify-center rounded-[6px] text-text-tertiary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-40"
      >
        <Trash2 className="size-3.5" />
      </button>
    </form>
  );
}

function ProtocolCard({
  protocol,
  services,
  canManage,
  labels,
}: {
  protocol: ProtocolWithSteps;
  services: ServiceOption[];
  canManage: boolean;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  const [toggleState, toggleAction, togglePending] = useActionState<
    ProtocolFormState | undefined,
    FormData
  >(toggleProtocolActive, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState<
    ProtocolFormState | undefined,
    FormData
  >(deleteProtocol, undefined);

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5">
            {open ? (
              <ChevronUp className="size-4 text-text-tertiary" />
            ) : (
              <ChevronDown className="size-4 text-text-tertiary" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{protocol.name}</p>
            {protocol.description && (
              <p className="mt-0.5 truncate text-xs text-text-secondary">{protocol.description}</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${protocol.isActive ? "bg-success/10 text-success" : "bg-text-tertiary/10 text-text-tertiary"}`}>
            {protocol.isActive ? labels.active : labels.inactive}
          </span>
          <span className="shrink-0 text-xs text-text-tertiary">
            {protocol.steps.length} {labels.steps}
          </span>
        </button>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <form action={toggleAction}>
              <input type="hidden" name="protocolId" value={protocol.id} />
              <button
                type="submit"
                disabled={togglePending}
                title={labels.toggle}
                className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40"
              >
                {protocol.isActive ? (
                  <ToggleRight className="size-4 text-success" />
                ) : (
                  <ToggleLeft className="size-4" />
                )}
              </button>
            </form>
            <form action={deleteAction}>
              <input type="hidden" name="protocolId" value={protocol.id} />
              <button
                type="submit"
                disabled={deletePending}
                title={labels.delete}
                className="flex size-8 items-center justify-center rounded-[8px] text-text-tertiary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {labels.stepsTitle}
          </p>
          {protocol.steps.length === 0 ? (
            <p className="text-xs text-text-tertiary">{labels.empty}</p>
          ) : (
            <div className="space-y-1.5">
              {protocol.steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2 rounded-[8px] bg-bg-elevated px-3 py-2">
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-text-tertiary">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-text-primary">{step.service.name}</span>
                  {step.durationMin && (
                    <span className="text-xs text-text-secondary">{step.durationMin} dəq</span>
                  )}
                  {step.intervalDays !== null && step.intervalDays > 0 && (
                    <span className="text-xs text-text-secondary">+{step.intervalDays} gün</span>
                  )}
                  {step.notes && (
                    <span className="max-w-[120px] truncate text-xs text-text-tertiary">{step.notes}</span>
                  )}
                  {canManage && (
                    <DeleteStepButton stepId={step.id} label={labels.stepDelete} />
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <AddStepForm
              protocolId={protocol.id}
              nextOrder={protocol.steps.length}
              services={services}
              labels={labels}
            />
          )}
        </div>
      )}

      {(toggleState?.error || deleteState?.error) && (
        <p className="border-t border-border-subtle px-4 py-2 text-xs text-error">{labels.error}</p>
      )}
    </div>
  );
}

export function ProtocolList({
  protocols,
  services,
  canManage,
  labels,
}: {
  protocols: ProtocolWithSteps[];
  services: ServiceOption[];
  canManage: boolean;
  labels: Labels;
}) {
  if (protocols.length === 0) {
    return (
      <p className="rounded-[14px] border border-border-subtle bg-bg-surface px-4 py-6 text-center text-sm text-text-secondary">
        {labels.empty}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {protocols.map((p) => (
        <ProtocolCard
          key={p.id}
          protocol={p}
          services={services}
          canManage={canManage}
          labels={labels}
        />
      ))}
    </div>
  );
}
