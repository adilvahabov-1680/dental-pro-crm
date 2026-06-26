import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, Clock3 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getClinicParams, getClinicProfile, getWorkingHours } from "@/lib/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClinicProfileForm } from "@/components/settings/ClinicProfileForm";
import { ClinicLogoForm } from "@/components/settings/ClinicLogoForm";
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

  const [clinic, params, hours] = await Promise.all([
    getClinicProfile(user),
    getClinicParams(user),
    getWorkingHours(user),
  ]);
  if (!clinic) {
    return <PageHeader title={t.modules.settings.title} description={t.common.noAccess} />;
  }

  return (
    <>
      <PageHeader title={t.modules.settings.title} description={t.modules.settings.desc} />

      {!canManage && (
        <p className="mb-4 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {ts.readOnly}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Building2} title={ts.profile.title} desc={ts.profile.desc} />
            <ClinicProfileForm dict={ts} clinic={clinic} canManage={canManage} />
            <ClinicLogoForm dict={ts} clinic={clinic} canManage={canManage} />
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
