"use client";

import { useActionState } from "react";
import { createStaffUser } from "@/lib/actions/admin";
import type { AdminFormState } from "@/lib/validation/admin";
import type { ASSIGNABLE_ROLES } from "@/lib/admin";
import type { Dict } from "@/i18n/az";

const inputCls =
  "h-10 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary " +
  "outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30";

export function CreateStaffForm({
  roles,
  dict,
  rolesDict,
}: {
  roles: readonly (typeof ASSIGNABLE_ROLES)[number][];
  dict: Dict["admin"];
  rolesDict: Dict["roles"];
}) {
  const [state, formAction, pending] = useActionState<AdminFormState | undefined, FormData>(
    createStaffUser,
    undefined,
  );
  const tf = dict.staff.form;
  const error = state?.error ? (dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic) : undefined;

  if (state?.saved && state.tempPassword) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-success">{tf.createdTitle}</p>
        <div className="rounded-[10px] border border-border-subtle bg-bg-base/60 p-3 text-sm">
          <p className="text-text-secondary">{state.email}</p>
          <p className="mt-1 font-mono text-base text-text-primary">{state.tempPassword}</p>
          <p className="mt-1 text-xs text-text-secondary">{tf.tempPassword}</p>
        </div>
        <p className="text-xs text-warning">{tf.tempPasswordNote}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" data-staff-create>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">{tf.fullName}</label>
        <input name="fullName" required maxLength={200} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">{tf.email}</label>
        <input name="email" type="email" required maxLength={200} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">{tf.phone}</label>
        <input name="phone" maxLength={50} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">{tf.role}</label>
        <select name="roleKey" defaultValue="reception" className={inputCls}>
          {roles.map((key) => (
            <option key={key} value={key}>
              {rolesDict[key]}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-[10px] border border-accent/40 bg-accent/10 text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {pending ? tf.submitting : tf.submit}
      </button>
    </form>
  );
}
