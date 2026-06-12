import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listClinicDoctors, listPatientOptions } from "@/lib/patients";
import { listServicesWithPrice } from "@/lib/treatments";
import { ADULT_UPPER, ADULT_LOWER, CHILD_UPPER, CHILD_LOWER } from "@/lib/dental-chart";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES } from "@/lib/validation/treatments";
import { PageHeader } from "@/components/ui/PageHeader";
import { TreatmentForm } from "@/components/treatments/TreatmentForm";

/** Общая форма Yeni müalicə (пациент выбирается; план/приём — после выбора, MVP: пусто). */
export default async function NewTreatmentPage() {
  const user = await requirePermission("treatments.manage");
  const t = getDict(user.locale);

  const [patients, doctors, services] = await Promise.all([
    listPatientOptions(user),
    listClinicDoctors(user),
    listServicesWithPrice(user),
  ]);

  const doctorLocked = user.role === "doctor" || user.role === "assistant";
  const lockedDoctorId =
    user.role === "doctor" ? user.doctorId : user.role === "assistant" ? user.assignedDoctorId : doctors[0]?.id;

  const toothNumbers = [...ADULT_UPPER, ...ADULT_LOWER, ...CHILD_UPPER, ...CHILD_LOWER].sort(
    (a, b) => a - b,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.treatments.form.title} description={t.treatments.form.desc} />
      <TreatmentForm
        dict={t.treatments}
        patients={patients.map((p) => ({
          id: p.id,
          name: `${p.lastName} ${p.firstName}${p.phone ? ` · ${p.phone}` : ""}`,
        }))}
        patientLocked={false}
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        doctorLocked={doctorLocked}
        services={services}
        plans={[]}
        appointments={[]}
        toothNumbers={toothNumbers}
        statusOptions={TREATMENT_ITEM_STATUSES.map((v) => ({
          value: v,
          label: TREATMENT_ITEM_STATUS_META[v].az,
        }))}
        defaults={{ doctorId: lockedDoctorId ?? undefined }}
        cancelHref="/treatments"
      />
    </div>
  );
}
