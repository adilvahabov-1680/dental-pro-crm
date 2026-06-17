import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { tenantClient } from "@/lib/tenant";
import {
  listServiceConsumableTemplates,
  listInventoryItemsForConsumable,
} from "@/lib/service-consumables";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ServiceConsumablesList } from "@/components/settings/ServiceConsumablesList";
import { ServiceConsumableAddForm } from "@/components/settings/ServiceConsumableAddForm";

export default async function ServiceConsumablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("settings.view");
  const t = getDict(user.locale);
  const ts = t.settings;
  const cp = ts.services.consumablesPage;
  const { id } = await params;

  const db = tenantClient(user.clinicId!);
  const service = await db.service.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  if (!service) notFound();

  const canManage = hasPermission(user, "settings.manage");

  const [templates, inventoryItems] = await Promise.all([
    listServiceConsumableTemplates(user, service.id),
    canManage ? listInventoryItemsForConsumable(user) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={service.name}
        description={service.category?.name ?? ts.services.form.categoryNone}
        actions={
          <Link
            href="/settings/services"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {cp.backToServices}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Package className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-accent">{cp.title}</h2>
              <p className="text-xs text-text-secondary">{cp.desc}</p>
            </div>
          </div>
          <ServiceConsumablesList templates={templates} dict={ts} />
        </Card>

        {canManage && (
          <div className="h-fit space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">{cp.add}</h2>
            <ServiceConsumableAddForm
              serviceId={service.id}
              items={inventoryItems}
              dict={ts}
            />
          </div>
        )}
      </div>
    </>
  );
}
