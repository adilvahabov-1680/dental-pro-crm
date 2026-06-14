"use client";

import { useActionState } from "react";
import { changeStaffRole, toggleStaffStatus } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { AdminFormState } from "@/lib/validation/admin";
import type { ASSIGNABLE_ROLES } from "@/lib/admin";
import type { RoleKey } from "@/types/auth";
import type { Dict } from "@/i18n/az";

export interface StaffRowDto {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleKey: RoleKey;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const selectCls =
  "h-9 rounded-[10px] border border-border-subtle bg-bg-base/60 px-2 text-sm text-text-primary " +
  "outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30";

function errMsg(dict: Dict["admin"], state: AdminFormState | undefined): string | undefined {
  if (!state?.error) return undefined;
  return dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic;
}

function RoleForm({
  row,
  roles,
  dict,
  rolesDict,
}: {
  row: StaffRowDto;
  roles: readonly (typeof ASSIGNABLE_ROLES)[number][];
  dict: Dict["admin"];
  rolesDict: Dict["roles"];
}) {
  const [state, formAction, pending] = useActionState<AdminFormState | undefined, FormData>(
    changeStaffRole,
    undefined,
  );
  const tt = dict.staff.table;
  const error = errMsg(dict, state);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" data-staff-role={row.id}>
      <input type="hidden" name="userId" value={row.id} />
      <select name="roleKey" defaultValue={row.roleKey} className={selectCls} aria-label={tt.role}>
        {roles.map((key) => (
          <option key={key} value={key}>
            {rolesDict[key]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-[10px] border border-accent/40 bg-accent/10 px-3 text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {tt.save}
      </button>
      {state?.saved && !pending && <span className="text-xs text-success">{dict.saved}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

function StatusForm({ row, dict }: { row: StaffRowDto; dict: Dict["admin"] }) {
  const [state, formAction, pending] = useActionState<AdminFormState | undefined, FormData>(
    toggleStaffStatus,
    undefined,
  );
  const tt = dict.staff.table;
  const error = errMsg(dict, state);

  return (
    <form action={formAction} data-staff-toggle={row.id} className="flex flex-col items-start gap-1">
      <input type="hidden" name="userId" value={row.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline disabled:opacity-50"
      >
        {row.isActive ? tt.deactivate : tt.activate}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export function StaffTable({
  rows,
  roles,
  dict,
  rolesDict,
  canManage,
  currentUserId,
}: {
  rows: StaffRowDto[];
  roles: readonly (typeof ASSIGNABLE_ROLES)[number][];
  dict: Dict["admin"];
  rolesDict: Dict["roles"];
  canManage: boolean;
  currentUserId: string;
}) {
  const tt = dict.staff.table;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
            <th className="py-2 pr-3 font-medium">{tt.name}</th>
            <th className="py-2 pr-3 font-medium">{tt.email}</th>
            <th className="py-2 pr-3 font-medium">{tt.role}</th>
            <th className="py-2 pr-3 font-medium">{tt.status}</th>
            <th className="py-2 pr-3 font-medium">{tt.created}</th>
            <th className="py-2 pr-3 font-medium">{tt.lastLogin}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {rows.map((row) => (
            <tr key={row.id} className={row.isActive ? "" : "opacity-55"}>
              <td className="py-3 pr-3">
                <p className="font-medium text-text-primary">
                  {row.fullName} {row.id === currentUserId && <span className="text-text-secondary">{tt.you}</span>}
                </p>
                {row.phone && <p className="text-xs text-text-secondary">{row.phone}</p>}
              </td>
              <td className="py-3 pr-3 text-text-secondary">{row.email}</td>
              <td className="py-3 pr-3">
                {canManage ? (
                  <RoleForm row={row} roles={roles} dict={dict} rolesDict={rolesDict} />
                ) : (
                  rolesDict[row.roleKey]
                )}
              </td>
              <td className="py-3 pr-3">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.isActive ? "success" : "neutral"}>
                    {row.isActive ? tt.active : tt.inactive}
                  </Badge>
                  {canManage && row.id !== currentUserId && <StatusForm row={row} dict={dict} />}
                </div>
              </td>
              <td className="py-3 pr-3 text-text-secondary">{formatDate(row.createdAt)}</td>
              <td className="py-3 pr-3 text-text-secondary">
                {row.lastLoginAt ? formatDate(row.lastLoginAt) : tt.never}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
