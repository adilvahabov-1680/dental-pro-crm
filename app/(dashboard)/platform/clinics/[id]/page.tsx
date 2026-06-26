import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getClinicDetail } from "@/lib/platform";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClinicStatusControl } from "@/components/platform/ClinicStatusControl";
import { EditClinicForm } from "@/components/platform/EditClinicForm";
import { PlatformClinicLogoForm } from "@/components/platform/PlatformClinicLogoForm";
import { ClinicUserList } from "@/components/platform/ClinicUserList";
import { CreateClinicUserForm } from "@/components/platform/CreateClinicUserForm";

export default async function ClinicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole("super_admin");
  const t = getDict(user.locale);
  const tp = t.platform;

  const clinic = await getClinicDetail(id);
  if (!clinic) notFound();
  // Сессия 84: raw logoUrl (relative storage path) клиентским компонентам
  // не передаём — только готовый URL, вычисленный здесь, на сервере.
  const clinicLogoSrc = clinic.logoUrl ? `/api/clinic-logo/${clinic.id}?v=${clinic.updatedAt.getTime()}` : null;

  return (
    <>
      <PageHeader
        title={clinic.name}
        description={`${tp.clinics.types[clinic.clinicType]} · ${tp.clinics.statuses[clinic.status]}`}
        actions={
          <Link
            href="/platform/clinics"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {tp.clinicDetail.backToList}
          </Link>
        }
      />

      <div className="space-y-6">
        <ClinicStatusControl
          clinicId={clinic.id}
          currentStatus={clinic.status}
          labels={tp.clinicDetail}
          errorLabels={tp.errors}
        />

        <EditClinicForm
          clinic={{
            id: clinic.id,
            slug: clinic.slug,
            name: clinic.name,
            phone: clinic.phone,
            email: clinic.email,
            address: clinic.address,
            timezone: clinic.timezone,
            currency: clinic.currency,
            defaultLocale: clinic.defaultLocale,
            clinicType: clinic.clinicType,
            status: clinic.status,
            plan: clinic.plan,
          }}
          labels={tp.clinicDetail.editClinic}
          errorLabels={tp.errors}
          typeLabels={tp.clinics.types}
          statusLabels={tp.clinics.statuses}
        />

        <PlatformClinicLogoForm
          clinic={{ id: clinic.id, name: clinic.name }}
          labels={tp.clinicDetail.logo}
          errorLabels={tp.errors}
          logoSrc={clinicLogoSrc}
        />

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">{tp.clinicDetail.usersSection}</h2>
          </div>
          <div className="mb-4">
            <CreateClinicUserForm
              clinicId={clinic.id}
              labels={{ ...tp.clinics.form, addUser: tp.clinicDetail.addUser }}
              errorLabels={tp.errors}
              roleLabels={t.roles}
            />
          </div>
          <ClinicUserList
            users={clinic.users}
            clinicId={clinic.id}
            labels={tp.clinicDetail}
            tableLables={tp.clinics.table}
            adminLabels={t.admin}
            errorLabels={tp.errors}
            roleLabels={t.roles}
          />
        </section>
      </div>
    </>
  );
}
