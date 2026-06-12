import Link from "next/link";
import { Search, Users, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listPatients } from "@/lib/patients";
import { calcAge, isChildPatient } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { ChildBadge, AllergyBadge } from "@/components/patients/PatientsTable";

/**
 * Общая страница Diş xəritəsi: поиск/выбор пациента → переход на карту.
 * Scope списка тот же, что в модуле пациентов (врач — свои и т.д.).
 */
export default async function DentalChartIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("dental_chart.view");
  const t = getDict(user.locale);
  const { q } = await searchParams;

  const { items } = await listPatients(user, { q: q || undefined, page: 1 });

  return (
    <>
      <PageHeader title={t.modules.dental_chart.title} description={t.dentalChart.selectPatientDesc} />

      {/* поиск (GET-форма, без JS) */}
      <form method="GET" className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.dentalChart.searchPlaceholder}
          className="h-10 w-full rounded-[10px] border border-border-subtle bg-bg-surface/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </form>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t.patients.empty.title}
            description={t.patients.empty.desc}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border-subtle/60">
          {items.map((p) => {
            const age = calcAge(p.birthDate);
            return (
              <Link
                key={p.id}
                href={`/patients/${p.id}/dental-chart`}
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-elevated/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <ToothIcon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary transition-colors group-hover:text-accent">
                      {p.lastName} {p.firstName}
                    </span>
                    {isChildPatient(p.birthDate, p.guardianId) && (
                      <ChildBadge label={t.patients.badges.child} />
                    )}
                    {p.allergies && <AllergyBadge label={t.patients.badges.allergy} />}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {p.phone ?? p.guardian?.phone ?? "—"}
                    {age !== null && ` · ${age} ${t.patients.table.yearsOld}`}
                    {p.primaryDoctor && ` · ${p.primaryDoctor.user.fullName}`}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-text-secondary transition-colors group-hover:text-accent">
                  {t.dentalChart.openChart} <ChevronRight className="size-4" />
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
