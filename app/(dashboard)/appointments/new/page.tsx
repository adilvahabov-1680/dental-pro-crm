import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listClinicDoctors, listPatientOptions } from "@/lib/patients";
import { getClinicParams } from "@/lib/settings";
import { toDateStr } from "@/lib/appointments";
import { APPOINTMENT_DURATIONS } from "@/lib/validation/appointments";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";

/**
 * Yeni qəbul. Преселект пациента — query-параметр ?patient=<id>
 * (кнопка на карточке пациента), без дублирования вложенным маршрутом.
 */
export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const user = await requirePermission("appointments.manage");
  const t = getDict(user.locale);
  const { patient } = await searchParams;

  // пациенты в scope пользователя (врач — свои); MVP: select до 200 записей
  const [patients, doctors, clinicParams] = await Promise.all([
    listPatientOptions(user),
    listClinicDoctors(user),
    getClinicParams(user),
  ]);

  // clinic-setting default_appointment_minutes; вне допустимого диапазона → 30
  const raw = clinicParams.defaultAppointmentMinutes;
  const defaultDuration = Number.isInteger(raw) && raw >= 5 && raw <= 480 ? raw : 30;
  // нестандартное значение (напр. 25) добавляется в список, иначе select молча выберет первый пункт
  const durations = APPOINTMENT_DURATIONS.includes(
    defaultDuration as (typeof APPOINTMENT_DURATIONS)[number],
  )
    ? APPOINTMENT_DURATIONS
    : [...APPOINTMENT_DURATIONS, defaultDuration].sort((a, b) => a - b);

  const doctorLocked = user.role === "doctor" || user.role === "assistant";
  const lockedDoctorId =
    user.role === "doctor" ? user.doctorId : user.role === "assistant" ? user.assignedDoctorId : null;

  const now = new Date();
  const nextHour = String(Math.min(now.getHours() + 1, 18)).padStart(2, "0");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.appointments.form.title} description={t.appointments.form.desc} />
      <AppointmentForm
        dict={t.appointments}
        patients={patients.map((p) => ({
          id: p.id,
          name: `${p.lastName} ${p.firstName}${p.phone ? ` · ${p.phone}` : ""}`,
        }))}
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        doctorLocked={doctorLocked}
        defaults={{
          patientId: patient,
          doctorId: lockedDoctorId ?? doctors[0]?.id,
          date: toDateStr(now),
          time: `${nextHour}:00`,
          durationMin: defaultDuration,
        }}
        durations={durations}
      />
    </div>
  );
}
