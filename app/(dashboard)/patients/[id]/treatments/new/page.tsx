import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getPatientForUser, listClinicDoctors } from "@/lib/patients";
import {
  listServicesWithPrice,
  listPatientPlans,
  listPatientAppointmentOptions,
} from "@/lib/treatments";
import { ADULT_UPPER, ADULT_LOWER, CHILD_UPPER, CHILD_LOWER } from "@/lib/dental-chart";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES, isValidFdi } from "@/lib/validation/treatments";
import { formatDate, isChildPatient } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { TreatmentForm } from "@/components/treatments/TreatmentForm";

/**
 * Yeni müalicə для пациента. Преселекты из query (?tooth=16, ?appointmentId=…)
 * валидируются: невалидный tooth игнорируется, чужой appointment не подставится
 * (список опций — только приёмы этого пациента; сервер проверяет ещё раз).
 */
export default async function NewPatientTreatmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tooth?: string; appointmentId?: string }>;
}) {
  const user = await requirePermission("treatments.manage");
  const t = getDict(user.locale);
  const { id } = await params;
  const sp = await searchParams;

  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const [doctors, services, plans, appointments] = await Promise.all([
    listClinicDoctors(user),
    listServicesWithPrice(user),
    listPatientPlans(user, patient.id),
    listPatientAppointmentOptions(user, patient.id),
  ]);

  const doctorLocked = user.role === "doctor" || user.role === "assistant";
  const lockedDoctorId =
    user.role === "doctor"
      ? user.doctorId
      : user.role === "assistant"
        ? user.assignedDoctorId
        : patient.primaryDoctorId ?? doctors[0]?.id;

  const toothParam = Number(sp.tooth);
  const toothPreselect = Number.isInteger(toothParam) && isValidFdi(toothParam) ? toothParam : undefined;
  // преселект приёма — только если он в списке приёмов ЭТОГО пациента
  const appointmentPreselect = appointments.some((a) => a.id === sp.appointmentId)
    ? sp.appointmentId
    : undefined;

  const child = isChildPatient(patient.birthDate, patient.guardianId);
  const toothNumbers = child
    ? [...CHILD_UPPER, ...CHILD_LOWER].sort((a, b) => a - b)
    : [...ADULT_UPPER, ...ADULT_LOWER].sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t.treatments.form.title}
        description={`${patient.lastName} ${patient.firstName}`}
      />
      <TreatmentForm
        dict={t.treatments}
        patients={[{ id: patient.id, name: `${patient.lastName} ${patient.firstName}` }]}
        patientLocked
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        doctorLocked={doctorLocked}
        services={services}
        plans={plans.map((p) => ({ id: p.id, title: p.title }))}
        appointments={appointments.map((a) => ({
          id: a.id,
          label: `${formatDate(a.startsAt)}${a.complaint ? ` · ${a.complaint}` : ""}`,
        }))}
        toothNumbers={toothNumbers}
        statusOptions={TREATMENT_ITEM_STATUSES.map((v) => ({
          value: v,
          label: TREATMENT_ITEM_STATUS_META[v].az,
        }))}
        defaults={{
          patientId: patient.id,
          doctorId: lockedDoctorId ?? undefined,
          toothNumber: toothPreselect,
          appointmentId: appointmentPreselect,
        }}
        cancelHref={`/patients/${patient.id}/treatments`}
      />
    </div>
  );
}
