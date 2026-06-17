"use client";

import { useState, useActionState } from "react";
import { transferDoctor } from "@/lib/actions/admin";
import type { AdminFormState } from "@/lib/validation/admin";
import type { DoctorTransferPreview } from "@/lib/admin";
import type { Dict } from "@/i18n/az";

const selectCls =
  "mt-1 block w-full rounded-[8px] border border-border-subtle bg-bg-elevated px-2 py-1.5 text-xs text-text-primary " +
  "focus:outline-none focus:ring-1 focus:ring-accent/40";

export interface DoctorForTransfer {
  userId: string;
  name: string;
  preview: DoctorTransferPreview;
}

export function DoctorTransferForm({
  doctors,
  dict,
}: {
  doctors: DoctorForTransfer[];
  dict: Dict["admin"];
}) {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [state, action, pending] = useActionState<AdminFormState | undefined, FormData>(
    transferDoctor,
    undefined,
  );
  const tt = dict.transfer;

  const fromDoctor = doctors.find((d) => d.userId === fromUserId);
  const toDoctor = doctors.find((d) => d.userId === toUserId);

  const error =
    state?.error
      ? (dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic)
      : undefined;

  const canSubmit = fromUserId !== "" && toUserId !== "" && !pending;

  return (
    <form action={action} data-e2e-doctor-transfer className="space-y-4">
      {/* From doctor */}
      <div>
        <label className="text-xs text-text-secondary">{tt.fromDoctor}</label>
        <select
          name="fromDoctorUserId"
          value={fromUserId}
          onChange={(e) => setFromUserId(e.target.value)}
          className={selectCls}
        >
          <option value="" disabled>
            {tt.selectPlaceholder}
          </option>
          {doctors.map((d) => (
            <option key={d.userId} value={d.userId}>
              {d.name}
            </option>
          ))}
        </select>
        {fromDoctor && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            {fromDoctor.preview.patientCount} {tt.previewPatients} ·{" "}
            {fromDoctor.preview.upcomingAppointmentCount} {tt.previewAppointments}
          </p>
        )}
      </div>

      {/* To doctor */}
      <div>
        <label className="text-xs text-text-secondary">{tt.toDoctor}</label>
        <select
          name="toDoctorUserId"
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className={selectCls}
        >
          <option value="" disabled>
            {tt.selectPlaceholder}
          </option>
          {doctors.map((d) => (
            <option key={d.userId} value={d.userId}>
              {d.name}
            </option>
          ))}
        </select>
        {toDoctor && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            {toDoctor.preview.patientCount} {tt.previewPatients} ·{" "}
            {toDoctor.preview.upcomingAppointmentCount} {tt.previewAppointments}
          </p>
        )}
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-text-primary">
          <input type="checkbox" name="transferPatients" value="on" className="accent-accent" />
          {tt.transferPatients}
        </label>
        <label className="flex items-center gap-2 text-xs text-text-primary">
          <input
            type="checkbox"
            name="transferAppointments"
            value="on"
            className="accent-accent"
          />
          {tt.transferAppointments}
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="h-8 rounded-[8px] border border-accent/30 bg-accent/10 px-4 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? tt.confirming : tt.confirm}
      </button>

      {/* Success */}
      {state?.saved && !pending && (
        <p className="text-xs text-success">
          {state.patientsMoved ?? 0} {tt.successPatients},{" "}
          {state.appointmentsMoved ?? 0} {tt.successAppointments}
        </p>
      )}

      {/* Error */}
      {error && !state?.saved && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
