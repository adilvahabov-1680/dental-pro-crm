import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { findAvailableAppointmentSlots } from "@/lib/protocols";
import { listClinicDoctors } from "@/lib/patients";
import { getClinicParams } from "@/lib/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { FollowUpScheduleForm } from "@/components/treatments/FollowUpScheduleForm";

export default async function TreatmentFollowUpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("appointments.manage");
  const t = getDict(user.locale);
  const tp = t.settings.protocols;
  const { id } = await params;

  const item = await getTreatmentItemForUser(user, id);
  if (!item) notFound();

  const [doctors, params_] = await Promise.all([
    listClinicDoctors(user),
    getClinicParams(user),
  ]);

  // doctor for this item (for slot pre-fetch)
  const itemDoctorId = item.doctorId;
  const durationMin =
    (item.service as { durationMin?: number | null }).durationMin ??
    params_.defaultAppointmentMinutes;

  // suggest slots from tomorrow
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() + 1);
  fromDate.setHours(0, 0, 0, 0);

  const slots = await findAvailableAppointmentSlots(user, itemDoctorId, fromDate, durationMin, {
    searchDays: 14,
    maxSlots: 5,
  });

  const defaultDoctorId =
    (user.role === "doctor" ? user.doctorId : null) ??
    (user.role === "assistant" ? user.assignedDoctorId : null) ??
    itemDoctorId ??
    "";

  const doctorOptions = doctors.map((d) => ({ id: d.id, name: d.user.fullName }));

  return (
    <>
      <PageHeader
        title={tp.followUpTitle}
        description={`${item.service.name} — ${item.patient.lastName} ${item.patient.firstName}`}
        actions={
          <Link
            href={`/patients/${item.patient.id}/treatments`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {t.treatments.patientBlock.title}
          </Link>
        }
      />

      <div className="max-w-2xl">
        <FollowUpScheduleForm
          treatmentItemId={item.id}
          defaultDoctorId={defaultDoctorId}
          doctors={doctorOptions}
          slots={slots}
          defaultDurationMin={durationMin}
          labels={{
            followUpTitle: tp.followUpTitle,
            followUpDate: tp.followUpDate,
            followUpTime: tp.followUpTime,
            followUpDuration: tp.followUpDuration,
            followUpDoctor: tp.followUpDoctor,
            followUpNotes: tp.followUpNotes,
            followUpBtn: tp.followUpBtn,
            followUpSaving: tp.followUpSaving,
            followUpSaved: tp.followUpSaved,
            slotsTitle: tp.slotsTitle,
            slotsEmpty: tp.slotsEmpty,
            error: t.settings.errors.generic,
            overlap: t.settings.errors.overlap,
            doctorRequired: t.settings.errors.doctorRequired,
          }}
        />
      </div>
    </>
  );
}
