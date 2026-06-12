import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { listTreatmentMaterials, listInventoryItems, formatQty } from "@/lib/inventory";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { TreatmentStatusBadge } from "@/components/treatments/TreatmentStatusBadge";
import { TreatmentMaterialsForm } from "@/components/inventory/TreatmentMaterialsForm";
import { TreatmentMaterialsList } from "@/components/inventory/TreatmentMaterialsList";

/**
 * Материалы процедуры: список использованных + форма списания.
 * Списание = treatments.manage (действие врача); cancelled — запрещено.
 */
export default async function TreatmentMaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const ti = t.inventory;
  const { id } = await params;

  // scope: tenant + роль через пациента; чужая процедура → 404
  const treatment = await getTreatmentItemForUser(user, id);
  if (!treatment) notFound();

  const canAdd =
    hasPermission(user, "treatments.manage") && treatment.status !== "cancelled";
  const [materials, stockItems] = await Promise.all([
    listTreatmentMaterials(user, treatment.id),
    canAdd ? listInventoryItems(user, {}) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${ti.materials.title} — ${treatment.service.name}`}
        description={`${treatment.patient.lastName} ${treatment.patient.firstName}${
          treatment.toothNumber ? ` · Diş ${treatment.toothNumber}` : ""
        } · ${formatDate(treatment.performedAt ?? treatment.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <TreatmentStatusBadge status={treatment.status} />
            <Link
              href={`/patients/${treatment.patient.id}/treatments`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {ti.materials.backToTreatments}
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        {canAdd && (
          <Card className="border-accent/20 bg-accent/5 p-5">
            <TreatmentMaterialsForm
              treatmentItemId={treatment.id}
              items={stockItems
                .filter((i) => Number(i.quantity) > 0)
                .map((i) => ({
                  id: i.id,
                  name: i.name,
                  unit: i.unit,
                  quantity: formatQty(i.quantity),
                }))}
              labels={{ ...ti.materials }}
              errors={ti.errors}
            />
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-accent">
            {ti.materials.title}{" "}
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {materials.length}
            </span>
          </h2>
          <TreatmentMaterialsList
            materials={materials}
            labels={{ empty: ti.materials.empty, cost: ti.materials.cost }}
          />
        </Card>
      </div>
    </div>
  );
}
