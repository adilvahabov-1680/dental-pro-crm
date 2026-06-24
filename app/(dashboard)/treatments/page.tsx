import Link from "next/link";
import { Plus, CalendarClock } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listTreatmentItems, type TreatmentFilters } from "@/lib/treatments";
import { getConsumableStatusMap } from "@/lib/treatment-consumables";
import { listClinicDoctors } from "@/lib/patients";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES } from "@/lib/validation/treatments";
import { PageHeader } from "@/components/ui/PageHeader";
import { TreatmentItemsList } from "@/components/treatments/TreatmentItemsList";
import { TreatmentsFilterBar } from "@/components/treatments/TreatmentsFilterBar";

export default async function TreatmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const tt = t.treatments;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filters: TreatmentFilters = {
    q: s("q"),
    doctorId: s("doctor"),
    status: TREATMENT_ITEM_STATUSES.includes(s("status") as never)
      ? (s("status") as TreatmentFilters["status"])
      : undefined,
    tooth: Number(s("tooth")) || undefined,
  };

  const canManage = hasPermission(user, "treatments.manage");
  const canManagePatients = hasPermission(user, "patients.manage");
  const showDoctorFilter = user.role !== "doctor" && user.role !== "assistant";
  const [items, doctors] = await Promise.all([
    listTreatmentItems(user, filters),
    showDoctorFilter ? listClinicDoctors(user) : Promise.resolve([]),
  ]);

  const statusMap = await getConsumableStatusMap(user, items.map((i) => i.id));
  const consumableStatusBadges: Record<string, { label: string; tone: "applied" | "reversed" | "reapplied" }> = {};
  for (const [id, st] of Object.entries(statusMap)) {
    if (st === "applied") consumableStatusBadges[id] = { label: t.treatments.consumables.statusApplied, tone: "applied" };
    else if (st === "reversed") consumableStatusBadges[id] = { label: t.treatments.consumables.statusReversed, tone: "reversed" };
    else if (st === "reapplied") consumableStatusBadges[id] = { label: t.treatments.consumables.statusReapplied, tone: "reapplied" };
  }

  const statusOptions = TREATMENT_ITEM_STATUSES.map((v) => ({
    value: v,
    label: TREATMENT_ITEM_STATUS_META[v].az,
  }));

  return (
    <>
      <PageHeader
        title={t.modules.treatments.title}
        description={t.modules.treatments.desc}
        actions={
          <>
            <Link
              href="/reports/daily-doctor"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <CalendarClock className="size-4" /> {t.reports.dailyDoctor.title}
            </Link>
            {canManage && (
              <Link
                href="/treatments/new"
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" /> {tt.new}
              </Link>
            )}
          </>
        }
      />

      <TreatmentsFilterBar
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        showDoctorFilter={showDoctorFilter}
        statusOptions={statusOptions}
        labels={{ ...tt.filters }}
      />

      <TreatmentItemsList
        items={items}
        canManage={canManage}
        statusOptions={statusOptions}
        labels={{ tooth: tt.card.tooth }}
        empty={tt.empty}
        showPatient
        materialsLabel={canManage ? t.inventory.materials.addTitle : undefined}
        consumablesLabel={canManage ? t.treatments.consumables.title : undefined}
        consumableStatusBadges={consumableStatusBadges}
        recallLabel={canManage ? tt.recall.createLabel : undefined}
        feedbackLabels={
          canManagePatients
            ? {
                label: t.patientFeedback.staff.createLabel,
                preparedLabel: t.communications.whatsapp.prepared,
                noPhoneLabel: t.communications.errors.noPhone,
                errors: t.patientFeedback.staff.errors,
              }
            : undefined
        }
      />
      {items.length > 0 && (
        <p className="mt-3 text-sm tabular-nums text-text-secondary">
          {items.length} {tt.total}
        </p>
      )}
    </>
  );
}
