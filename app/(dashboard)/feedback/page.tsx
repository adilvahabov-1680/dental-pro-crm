import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listRecentFeedback } from "@/lib/patient-feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatientFeedbackBlock } from "@/components/patients/PatientFeedbackBlock";

export default async function FeedbackPage() {
  const user = await requirePermission("patients.view");
  const t = getDict(user.locale);

  const rows = await listRecentFeedback(user);

  return (
    <>
      <PageHeader title={t.patientFeedback.list.pageTitle} description={t.patientFeedback.list.pageDesc} />
      <PatientFeedbackBlock
        rows={rows}
        showPatient
        labels={{ title: t.patientFeedback.list.blockTitle, empty: t.patientFeedback.list.empty }}
      />
    </>
  );
}
