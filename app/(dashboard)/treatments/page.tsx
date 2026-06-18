import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listTreatmentItems, type TreatmentFilters } from "@/lib/treatments";
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
  const showDoctorFilter = user.role !== "doctor" && user.role !== "assistant";
  const [items, doctors] = await Promise.all([
    listTreatmentItems(user, filters),
    showDoctorFilter ? listClinicDoctors(user) : Promise.resolve([]),
  ]);

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
          canManage ? (
            <Link
              href="/treatments/new"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" /> {tt.new}
            </Link>
          ) : undefined
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
      />
      {items.length > 0 && (
        <p className="mt-3 text-sm tabular-nums text-text-secondary">
          {items.length} {tt.total}
        </p>
      )}
    </>
  );
}
