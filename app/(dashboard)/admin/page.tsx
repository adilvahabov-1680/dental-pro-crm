import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { ASSIGNABLE_ROLES, listAssignableRoles, listStaff } from "@/lib/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StaffTable, type StaffRowDto } from "@/components/admin/StaffTable";
import { CreateStaffForm } from "@/components/admin/CreateStaffForm";

/** Admin v1 — клиничный раздел: кадры и роли (owner/admin). */
export default async function AdminPage() {
  const user = await requirePermission("admin.view");
  const t = getDict(user.locale);
  const ta = t.admin;

  // super_admin (clinicId: null) — клиничного admin нет, защитный redirect.
  if (!user.clinicId) redirect("/dashboard");

  const canManage = hasPermission(user, "admin.manage");

  const [staff, roles] = await Promise.all([listStaff(user.clinicId), listAssignableRoles()]);
  const roleKeys = ASSIGNABLE_ROLES.filter((key) => roles.some((r) => r.key === key));

  const rows: StaffRowDto[] = staff.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    email: s.email,
    phone: s.phone,
    roleKey: s.roleKey,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
  }));

  return (
    <>
      <PageHeader title={t.modules.admin.title} description={t.modules.admin.desc} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold text-accent">
            {ta.staff.title}{" "}
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {rows.length}
            </span>
          </h2>
          <StaffTable
            rows={rows}
            roles={roleKeys}
            dict={ta}
            rolesDict={t.roles}
            canManage={canManage}
            currentUserId={user.id}
          />
        </Card>

        {canManage && (
          <Card className="h-fit border-accent/20 bg-accent/5 p-5">
            <h2 className="mb-4 text-sm font-semibold text-accent">{ta.staff.form.title}</h2>
            <CreateStaffForm roles={roleKeys} dict={ta} rolesDict={t.roles} />
          </Card>
        )}
      </div>
    </>
  );
}
