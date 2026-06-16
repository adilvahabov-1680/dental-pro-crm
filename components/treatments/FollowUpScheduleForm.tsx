"use client";

import { useActionState } from "react";
import { Calendar } from "lucide-react";
import { scheduleFollowUp } from "@/lib/actions/protocols";
import type { ProtocolFormState } from "@/lib/validation/protocols";
import type { SlotSuggestion } from "@/lib/protocols";

interface Doctor {
  id: string;
  name: string;
}

interface Labels {
  followUpTitle: string;
  followUpDate: string;
  followUpTime: string;
  followUpDuration: string;
  followUpDoctor: string;
  followUpNotes: string;
  followUpBtn: string;
  followUpSaving: string;
  followUpSaved: string;
  slotsTitle: string;
  slotsEmpty: string;
  error: string;
  overlap: string;
  doctorRequired: string;
}

interface Props {
  treatmentItemId: string;
  defaultDoctorId: string;
  doctors: Doctor[];
  slots: SlotSuggestion[];
  defaultDurationMin: number;
  labels: Labels;
}

export function FollowUpScheduleForm({
  treatmentItemId,
  defaultDoctorId,
  doctors,
  slots,
  defaultDurationMin,
  labels,
}: Props) {
  const [state, action, pending] = useActionState<ProtocolFormState | undefined, FormData>(
    scheduleFollowUp,
    undefined,
  );

  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="size-4 text-accent" />
        <p className="text-sm font-semibold text-text-primary">{labels.followUpTitle}</p>
      </div>

      {/* Suggested slots */}
      {slots.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-text-secondary">{labels.slotsTitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <button
                key={`${s.date}-${s.time}`}
                type="button"
                onClick={() => {
                  const form = document.getElementById(`fu-form-${treatmentItemId}`) as HTMLFormElement | null;
                  if (!form) return;
                  (form.elements.namedItem("date") as HTMLInputElement).value = s.date;
                  (form.elements.namedItem("time") as HTMLInputElement).value = s.time;
                }}
                className="rounded-[8px] border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
              >
                {s.date} {s.time}
              </button>
            ))}
          </div>
        </div>
      )}
      {slots.length === 0 && (
        <p className="mb-3 text-xs text-text-tertiary">{labels.slotsEmpty}</p>
      )}

      <form id={`fu-form-${treatmentItemId}`} action={action} className="space-y-3">
        <input type="hidden" name="treatmentItemId" value={treatmentItemId} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.followUpDate}
            </label>
            <input
              name="date"
              type="date"
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {state?.fieldErrors?.date && (
              <p className="mt-0.5 text-xs text-error">{state.fieldErrors.date}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.followUpTime}
            </label>
            <input
              name="time"
              type="time"
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.followUpDuration}
            </label>
            <input
              name="durationMin"
              type="number"
              min={5}
              max={480}
              defaultValue={defaultDurationMin}
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {labels.followUpDoctor}
            </label>
            <select
              name="doctorId"
              defaultValue={defaultDoctorId}
              required
              className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {labels.followUpNotes}
          </label>
          <input
            name="notes"
            maxLength={500}
            className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? labels.followUpSaving : labels.followUpBtn}
          </button>

          {state?.saved && (
            <span className="text-sm font-medium text-success">{labels.followUpSaved}</span>
          )}
          {state?.error === "overlap" && (
            <span className="text-sm text-error">{labels.overlap}</span>
          )}
          {state?.error === "notFound" || (state?.error && state.error !== "overlap") ? (
            <span className="text-sm text-error">{labels.error}</span>
          ) : null}
          {state?.error === "doctorRequired" && (
            <span className="text-sm text-error">{labels.doctorRequired}</span>
          )}
        </div>
      </form>
    </div>
  );
}
