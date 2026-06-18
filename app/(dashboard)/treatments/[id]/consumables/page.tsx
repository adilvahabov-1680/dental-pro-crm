import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getTreatmentItemForUser } from "@/lib/treatments";
import {
  getConsumableTemplatesForService,
  getConsumableUsagesForTreatment,
} from "@/lib/treatment-consumables";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { TreatmentStatusBadge } from "@/components/treatments/TreatmentStatusBadge";
import { TreatmentConsumableChecklist } from "@/components/treatments/TreatmentConsumableChecklist";

/**
 * Sərfiyyatlar — checklist страница для применения расходников по шаблонам.
 * treatments.view для просмотра; treatments.manage для применения.
 */
export default async function TreatmentConsumablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const { id } = await params;

  const treatment = await getTreatmentItemForUser(user, id);
  if (!treatment) notFound();

  const canManage = hasPermission(user, "treatments.manage") && treatment.status !== "cancelled";

  const [templates, usages] = await Promise.all([
    getConsumableTemplatesForService(user, treatment.serviceId),
    getConsumableUsagesForTreatment(user, treatment.id),
  ]);

  const labels = t.treatments.consumables;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={labels.title}
        description={`${treatment.service.name} · ${treatment.patient.lastName} ${treatment.patient.firstName}${
          treatment.toothNumber ? ` · Diş ${treatment.toothNumber}` : ""
        } · ${formatDate(treatment.performedAt ?? treatment.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <TreatmentStatusBadge status={treatment.status} />
            <Link
              href={`/patients/${treatment.patient.id}/treatments`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {labels.backToTreatments}
            </Link>
          </div>
        }
      />

      <Card className="p-5" data-e2e-marker={`consumables-page-${treatment.id}`}>
        <TreatmentConsumableChecklist
          treatmentItemId={treatment.id}
          templates={templates}
          existingUsages={usages}
          dict={t.treatments}
          canManage={canManage}
        />
      </Card>
    </div>
  );
}
