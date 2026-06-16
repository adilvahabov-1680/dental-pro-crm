import { requireRole } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listClinics } from "@/lib/platform";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClinicListTable } from "@/components/platform/ClinicListTable";
import { CreateClinicForm } from "@/components/platform/CreateClinicForm";

export default async function PlatformClinicsPage() {
  const user = await requireRole("super_admin");
  const t = getDict(user.locale);
  const tp = t.platform;
  const clinics = await listClinics();

  return (
    <>
      <PageHeader title={tp.clinics.title} description={tp.clinics.desc} />
      <div className="mb-6">
        <CreateClinicForm labels={tp.clinics.form} errorLabels={tp.errors} roleLabels={t.roles} />
      </div>
      <ClinicListTable clinics={clinics} labels={tp.clinics.table} statusLabels={tp.clinics.statuses} typeLabels={tp.clinics.types} />
    </>
  );
}
