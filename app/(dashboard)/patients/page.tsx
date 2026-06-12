import Link from "next/link";
import { Users, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  listPatients,
  listClinicDoctors,
  PATIENTS_PAGE_SIZE,
  type PatientListFilters,
} from "@/lib/patients";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PatientFilters } from "@/components/patients/PatientFilters";
import { PatientsTable } from "@/components/patients/PatientsTable";
import { cn } from "@/lib/utils";

function parseFilters(sp: Record<string, string | string[] | undefined>): PatientListFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return {
    q: s("q"),
    doctorId: s("doctor"),
    type: s("type") === "adult" || s("type") === "child" ? (s("type") as "adult" | "child") : undefined,
    gender: s("gender") === "male" || s("gender") === "female" ? (s("gender") as "male" | "female") : undefined,
    allergy: s("allergy") === "yes" ? "yes" : undefined,
    status: s("status") === "archived" ? "archived" : undefined,
    created: s("created") === "recent30" ? "recent30" : undefined,
    page: Number(s("page") ?? "1") || 1,
  };
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("patients.view");
  const t = getDict(user.locale);
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [{ items, total, page }, doctors] = await Promise.all([
    listPatients(user, filters),
    listClinicDoctors(user),
  ]);
  const canManage = hasPermission(user, "patients.manage");
  const pages = Math.max(1, Math.ceil(total / PATIENTS_PAGE_SIZE));

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") next.set(k, v);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return `/patients${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={t.modules.patients.title}
        description={t.modules.patients.desc}
        actions={
          canManage ? (
            <Link
              href="/patients/new"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
            >
              <UserPlus className="size-4" /> {t.patients.new}
            </Link>
          ) : undefined
        }
      />

      <PatientFilters
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        labels={{ searchPlaceholder: t.patients.searchPlaceholder, ...t.patients.filters }}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t.patients.empty.title}
            description={t.patients.empty.desc}
          />
        </Card>
      ) : (
        <>
          <PatientsTable items={items} dict={t.patients} canManage={canManage} />
          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span className="tabular-nums">
              {total} {t.patients.pagination.total}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Link
                  href={pageHref(page - 1)}
                  aria-disabled={page <= 1}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-[8px] px-2.5 transition-colors hover:bg-bg-elevated hover:text-text-primary",
                    page <= 1 && "pointer-events-none opacity-40",
                  )}
                >
                  <ChevronLeft className="size-4" /> {t.patients.pagination.prev}
                </Link>
                <span className="px-2 tabular-nums">
                  {page} / {pages}
                </span>
                <Link
                  href={pageHref(page + 1)}
                  aria-disabled={page >= pages}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-[8px] px-2.5 transition-colors hover:bg-bg-elevated hover:text-text-primary",
                    page >= pages && "pointer-events-none opacity-40",
                  )}
                >
                  {t.patients.pagination.next} <ChevronRight className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
