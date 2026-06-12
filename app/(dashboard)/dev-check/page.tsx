import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCurrentTenant, getTenantFilter, canAccessClinic, canAccessDoctorData } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { MODULES } from "@/types/permissions";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

const FAKE_CLINIC_ID = "00000000-0000-0000-0000-000000000bad";
const FAKE_DOCTOR_ID = "00000000-0000-0000-0000-00000000d0c2";

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="size-4 shrink-0 text-danger" />
      )}
      <span className="text-text-secondary">{label}</span>
    </li>
  );
}

/**
 * DEV-ONLY страница проверки auth/tenant-хелперов на живой сессии.
 * В production (npm run build/start) недоступна — notFound().
 * Не добавлена в sidebar; открывается напрямую: /dev-check.
 */
export default async function DevCheckPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const user = await requireAuth(); // + requirePermission проверяется на каждой модульной странице
  const tenant = await getCurrentTenant();
  const filter = getTenantFilter(user);

  return (
    <>
      <PageHeader
        title="Dev Check"
        description="Auth / tenant helpers — только development mode"
        actions={<Badge tone="warning">DEV ONLY</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-accent" /> getCurrentUser()
          </h2>
          <pre className="overflow-x-auto rounded-[10px] bg-bg-base/60 p-3 text-xs leading-relaxed text-text-secondary">
            {JSON.stringify(user, null, 2)}
          </pre>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Tenant helpers</h2>
            <ul className="space-y-2">
              <Flag ok={true} label={`getCurrentTenant() → ${tenant ?? "null (super_admin)"}`} />
              <Flag ok={true} label={`getTenantFilter() → ${JSON.stringify(filter)}`} />
              <Flag
                ok={tenant ? canAccessClinic(user, tenant) : user.role === "super_admin"}
                label="canAccessClinic(своя клиника) → true"
              />
              <Flag
                ok={user.role === "super_admin" || !canAccessClinic(user, FAKE_CLINIC_ID)}
                label="canAccessClinic(чужая клиника) → false (кроме super_admin)"
              />
              <Flag
                ok={
                  user.role === "doctor"
                    ? canAccessDoctorData(user, user.doctorId ?? "") &&
                      !canAccessDoctorData(user, FAKE_DOCTOR_ID)
                    : true
                }
                label="canAccessDoctorData: doctor — только свой doctor_id"
              />
              <Flag
                ok={
                  user.role === "assistant"
                    ? !canAccessDoctorData(user, FAKE_DOCTOR_ID)
                    : true
                }
                label="canAccessDoctorData: assistant — только прикреплённый врач"
              />
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">
              hasPermission() — снимок прав сессии ({user.permissions.length})
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {MODULES.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-text-secondary">{m}</span>
                  <span className="font-mono">
                    <span className={hasPermission(user, `${m}.view`) ? "text-success" : "text-danger"}>
                      v
                    </span>
                    {"/"}
                    <span className={hasPermission(user, `${m}.manage`) ? "text-success" : "text-danger"}>
                      m
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-text-secondary/70">
              requirePermission() проверяется на каждой модульной странице (redirect → /dashboard).
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
