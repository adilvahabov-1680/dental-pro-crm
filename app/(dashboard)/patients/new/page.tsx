import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listClinicDoctors } from "@/lib/patients";
import { createPatient } from "@/lib/actions/patients";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatientForm } from "@/components/patients/PatientForm";

export default async function NewPatientPage() {
  const user = await requirePermission("patients.manage");
  const t = getDict(user.locale);
  const doctors = await listClinicDoctors(user);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.patients.form.createTitle} description={t.patients.form.createDesc} />
      <PatientForm
        action={createPatient}
        dict={t.patients}
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        initial={user.role === "doctor" && user.doctorId ? { primaryDoctorId: user.doctorId } : {}}
      />
    </div>
  );
}
