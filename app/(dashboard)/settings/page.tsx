import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, Clock3, UserCircle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getClinicParams, getClinicProfile, getWorkingHours } from "@/lib/settings";
import { getOwnAvatar } from "@/lib/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClinicProfileForm } from "@/components/settings/ClinicProfileForm";
import { ClinicLogoForm } from "@/components/settings/ClinicLogoForm";
import { UserAvatarForm } from "@/components/settings/UserAvatarForm";
import { ClinicParamsForm } from "@/components/settings/ClinicParamsForm";
import { WorkingHoursForm } from "@/components/settings/WorkingHoursForm";

function SectionTitle({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Building2;
  title: string;
  desc: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon className="size-5" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary">{desc}</p>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requirePermission("settings.view");
  const t = getDict(user.locale);
  const ts = t.settings;
  const canManage = hasPermission(user, "settings.manage");

  const [clinic, params, hours, avatar] = await Promise.all([
    getClinicProfile(user),
    getClinicParams(user),
    getWorkingHours(user),
    getOwnAvatar(user),
  ]);
  if (!clinic) {
    return <PageHeader title={t.modules.settings.title} description={t.common.noAccess} />;
  }
  // Сессия 84: raw logoUrl (relative storage path) клиентским компонентам
  // не передаём — только готовый URL, вычисленный здесь, на сервере.
  const clinicLogoSrc = clinic.logoUrl ? `/api/clinic-logo/${clinic.id}?v=${clinic.updatedAt.getTime()}` : null;

  return (
    <>
      <PageHeader title={t.modules.settings.title} description={t.modules.settings.desc} />

      {/* Личный аватар — доступен любому пользователю, попавшему на /settings,
          независимо от canManage (это не настройка клиники, а личная). */}
      <Card className="mb-4 p-5">
        <SectionTitle icon={UserCircle} title={ts.avatar.title} desc={ts.avatar.desc} />
        <UserAvatarForm
          dict={ts}
          user={{ id: user.id, fullName: user.fullName }}
          avatarSrc={avatar?.avatarUrl ? `/api/user-avatar/${user.id}?v=${avatar.updatedAt.getTime()}` : null}
        />
      </Card>

      {!canManage && (
        <p className="mb-4 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {ts.readOnly}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Building2} title={ts.profile.title} desc={ts.profile.desc} />
            <ClinicProfileForm
              dict={ts}
              clinic={{ name: clinic.name, phone: clinic.phone, email: clinic.email, address: clinic.address }}
              canManage={canManage}
            />
            <ClinicLogoForm dict={ts} clinic={{ name: clinic.name }} canManage={canManage} logoSrc={clinicLogoSrc} />
          </Card>

          <Card className="p-5">
            <SectionTitle icon={CalendarClock} title={ts.params.title} desc={ts.params.desc} />
            <ClinicParamsForm dict={ts} params={params} canManage={canManage} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Clock3} title={ts.hours.title} desc={ts.hours.desc} />
            <WorkingHoursForm dict={ts} hours={hours} canManage={canManage} />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{ts.services.title}</h2>
                <p className="mt-0.5 text-xs text-text-secondary">{ts.services.desc}</p>
              </div>
              <Link
                href="/settings/services"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-accent/40 bg-accent/10 px-4 text-sm text-accent transition-colors hover:bg-accent/20"
              >
                {ts.services.openPage} <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{ts.protocols.title}</h2>
                <p className="mt-0.5 text-xs text-text-secondary">{ts.protocols.desc}</p>
              </div>
              <Link
                href="/settings/protocols"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-accent/40 bg-accent/10 px-4 text-sm text-accent transition-colors hover:bg-accent/20"
              >
                {ts.protocols.openPage} <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
