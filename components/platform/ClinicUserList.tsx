"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  platformResetPassword,
  platformChangeLogin,
  platformToggleUserStatus,
} from "@/lib/actions/platform";
import { useToast } from "@/components/ui/Toaster";
import type { ClinicUserRow } from "@/lib/platform";
import type { PlatformFormState } from "@/lib/validation/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinicDetail"];
type TableLabels = Dict["platform"]["clinics"]["table"];
type AdminLabels = Dict["admin"];
type ErrorLabels = Dict["platform"]["errors"];
type RoleLabels = Dict["roles"];

// ── Sub-components for each inline action ──────────────────

function ResetPasswordRow({
  userId,
  labels,
  errorLabels,
}: {
  userId: string;
  labels: Labels;
  errorLabels: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    platformResetPassword,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) setShow(false);
    else if (state?.error) toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
  }, [state, toast, errorLabels]);

  return (
    <form action={action} className="flex items-center gap-2" data-e2e-platform-reset={userId}>
      <input type="hidden" name="userId" value={userId} />
      {!show ? (
        <button type="button" onClick={() => setShow(true)} className="text-xs text-accent hover:underline">
          {labels.resetPassword}
        </button>
      ) : (
        <>
          <input
            name="newPassword"
            required
            minLength={6}
            maxLength={100}
            placeholder="Yeni şifrə"
            className="h-7 w-32 rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-[6px] bg-accent/10 border border-accent/30 px-2 py-0.5 text-xs text-accent disabled:opacity-50"
          >
            {pending ? "…" : "OK"}
          </button>
          <button type="button" onClick={() => setShow(false)} className="text-xs text-text-tertiary">✕</button>
          {state?.saved && state.tempPassword && (
            <span className="font-mono text-xs text-success">{state.tempPassword}</span>
          )}
        </>
      )}
    </form>
  );
}

function ChangeLoginRow({
  userId,
  currentEmail,
  labels,
  errorLabels,
}: {
  userId: string;
  currentEmail: string;
  labels: Labels;
  errorLabels: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    platformChangeLogin,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) { toast("Giriş dəyişdirildi", "success"); setShow(false); }
    else if (state?.error) toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
  }, [state, toast, errorLabels]);

  return (
    <form action={action} className="flex items-center gap-2" data-e2e-platform-login-change={userId}>
      <input type="hidden" name="userId" value={userId} />
      {!show ? (
        <button type="button" onClick={() => setShow(true)} className="text-xs text-accent hover:underline">
          {labels.changeLogin}
        </button>
      ) : (
        <>
          <input
            name="newEmail"
            type="text"
            required
            maxLength={255}
            defaultValue={currentEmail}
            className="h-7 w-48 rounded-[8px] border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-[6px] bg-accent/10 border border-accent/30 px-2 py-0.5 text-xs text-accent disabled:opacity-50"
          >
            {pending ? "…" : "OK"}
          </button>
          <button type="button" onClick={() => setShow(false)} className="text-xs text-text-tertiary">✕</button>
        </>
      )}
    </form>
  );
}

function ToggleStatusButton({
  userId,
  isActive,
  labels,
  errorLabels,
}: {
  userId: string;
  isActive: boolean;
  labels: Labels;
  errorLabels: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<PlatformFormState | undefined, FormData>(
    platformToggleUserStatus,
    undefined,
  );
  const toast = useToast();
  const prevState = useRef<typeof state>(undefined);

  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.error) toast(errorLabels[state.error as keyof typeof errorLabels] ?? errorLabels.generic, "error");
  }, [state, toast, errorLabels]);

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-[6px] border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${
          isActive
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-success/30 bg-success/10 text-success"
        }`}
      >
        {pending ? "…" : isActive ? labels.toggleStatus : labels.activate}
      </button>
    </form>
  );
}

// ── Main list ────────────────────────────────────────────

export function ClinicUserList({
  users,
  clinicId: _clinicId,
  labels,
  tableLables,
  adminLabels: _adminLabels,
  errorLabels,
  roleLabels,
}: {
  users: ClinicUserRow[];
  clinicId: string;
  labels: Labels;
  tableLables: TableLabels;
  adminLabels: AdminLabels;
  errorLabels: ErrorLabels;
  roleLabels: RoleLabels;
}) {
  if (users.length === 0) {
    return (
      <p className="rounded-[12px] border border-border-subtle bg-bg-surface p-4 text-sm text-text-secondary">
        İstifadəçi yoxdur.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            {[tableLables.name, tableLables.email, "Rol", tableLables.status, ""].map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-bg-elevated/40 transition-colors">
              <td className="px-4 py-3 font-medium text-text-primary">{u.fullName}</td>
              <td className="px-4 py-3 text-text-secondary">{u.email}</td>
              <td className="px-4 py-3 text-text-secondary">{roleLabels[u.roleKey]}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    u.isActive
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-danger/30 bg-danger/10 text-danger"
                  }`}
                >
                  {u.isActive ? "Aktiv" : "Deaktiv"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <ResetPasswordRow userId={u.id} labels={labels} errorLabels={errorLabels} />
                  <ChangeLoginRow
                    userId={u.id}
                    currentEmail={u.email}
                    labels={labels}
                    errorLabels={errorLabels}
                  />
                  <ToggleStatusButton
                    userId={u.id}
                    isActive={u.isActive}
                    labels={labels}
                    errorLabels={errorLabels}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
