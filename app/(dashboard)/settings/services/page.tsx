import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listServiceCategories, listServicesForSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ServiceCreateForm } from "@/components/settings/ServiceCreateForm";
import { ServicesTable, type ServiceRow } from "@/components/settings/ServicesTable";

export default async function SettingsServicesPage() {
  const user = await requirePermission("settings.view");
  const t = getDict(user.locale);
  const ts = t.settings;
  const canManage = hasPermission(user, "settings.manage");

  const [services, categories] = await Promise.all([
    listServicesForSettings(user),
    listServiceCategories(user),
  ]);

  const rows: ServiceRow[] = services.map((s) => ({
    ...s,
    priceValidFrom: s.priceValidFrom ? s.priceValidFrom.toISOString() : null,
  }));

  return (
    <>
      <PageHeader
        title={ts.services.title}
        description={ts.services.desc}
        actions={
          <Link
            href="/settings"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {ts.services.backToSettings}
          </Link>
        }
      />

      {!canManage && (
        <p className="mb-4 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {ts.readOnly}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="h-fit p-5">
          <h2 className="mb-1 text-sm font-semibold text-accent">
            {ts.services.title}{" "}
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {rows.length}
            </span>
          </h2>
          <p className="mb-3 text-xs text-text-secondary">{ts.services.priceHistoryNote}</p>
          <ServicesTable dict={ts} rows={rows} canManage={canManage} />
        </Card>

        {canManage && (
          <Card className="h-fit border-accent/20 bg-accent/5 p-5">
            <h2 className="mb-4 text-sm font-semibold text-accent">{ts.services.form.title}</h2>
            <ServiceCreateForm dict={ts} categories={categories} />
          </Card>
        )}
      </div>
    </>
  );
}
