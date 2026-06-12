import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getPatientForUser, listClinicDoctors } from "@/lib/patients";
import { updatePatient } from "@/lib/actions/patients";
import { isChildPatient } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatientForm } from "@/components/patients/PatientForm";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("patients.manage");
  const t = getDict(user.locale);
  const { id } = await params;

  // tenant + ролевой scope: врач/ассистент не могут открыть чужого на редактирование
  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const doctors = await listClinicDoctors(user);
  const child = isChildPatient(patient.birthDate, patient.guardianId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t.patients.form.editTitle}
        description={`${patient.lastName} ${patient.firstName}`}
      />
      <PatientForm
        action={updatePatient}
        dict={t.patients}
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        initial={{
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          fatherName: patient.fatherName,
          phone: patient.phone,
          email: patient.email,
          birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
          gender: patient.gender,
          address: patient.address,
          notes: patient.notes,
          allergies: patient.allergies,
          chronicDiseases: patient.chronicDiseases,
          anamnesis: patient.anamnesis,
          source: patient.source,
          primaryDoctorId: patient.primaryDoctorId,
          status: patient.status,
          isChild: child,
          guardianFullName: patient.guardian
            ? `${patient.guardian.firstName} ${patient.guardian.lastName}`
            : null,
          guardianPhone: patient.guardian?.phone ?? null,
        }}
      />
    </div>
  );
}
