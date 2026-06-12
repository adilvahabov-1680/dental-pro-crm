import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser } from "@/lib/patients";
import { listPatientTreatments } from "@/lib/treatments";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES } from "@/lib/validation/treatments";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { TreatmentItemsList } from "@/components/treatments/TreatmentItemsList";
import { TreatmentPlanSummary } from "@/components/treatments/TreatmentPlanSummary";
import { PlanCreateForm } from "@/components/treatments/PlanCreateForm";

export default async function PatientTreatmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const tt = t.treatments;
  const { id } = await params;

  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const canManage = hasPermission(user, "treatments.manage");
  const { plans, items, total, activeAmount, doneAmount } = await listPatientTreatments(
    user,
    patient.id,
  );

  const statusOptions = TREATMENT_ITEM_STATUSES.map((v) => ({
    value: v,
    label: TREATMENT_ITEM_STATUS_META[v].az,
  }));

  return (
    <>
      <PageHeader
        title={`${tt.patientBlock.title} — ${patient.lastName} ${patient.firstName}`}
        description={`${total} ${tt.total} · ${tt.patientBlock.totalActive}: ${formatMoney(activeAmount)} · ${tt.patientBlock.totalDone}: ${formatMoney(doneAmount)}`}
        actions={
          <div className="flex items-center gap-2">
            {hasPermission(user, "finance.manage") && (
              <Link
                href={`/finance/invoices/new?patientId=${patient.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
              >
                {t.finance.newInvoice}
              </Link>
            )}
            {canManage && (
              <Link
                href={`/patients/${patient.id}/treatments/new`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" /> {tt.new}
              </Link>
            )}
            <Link
              href={`/patients/${patient.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {patient.lastName} {patient.firstName}
            </Link>
          </div>
        }
      />

      {/* планы */}
      {plans.length > 0 && (
        <div className="mb-4 space-y-2">
          {plans.map((p) => (
            <TreatmentPlanSummary
              key={p.id}
              plan={{
                id: p.id,
                title: p.title,
                status: p.status,
                totalPrice: p.totalPrice,
                itemsCount: p._count.items,
              }}
              labels={{ items: tt.plan.items, total: tt.plan.total }}
            />
          ))}
        </div>
      )}
      {canManage && (
        <PlanCreateForm
          patientId={patient.id}
          labels={{
            newTitle: tt.plan.newTitle,
            titleLabel: tt.plan.titleLabel,
            create: tt.plan.create,
            error: tt.errors.titleRequired,
          }}
        />
      )}

      <TreatmentItemsList
        items={items}
        canManage={canManage}
        statusOptions={statusOptions}
        labels={{ tooth: tt.card.tooth }}
        empty={tt.empty}
        materialsLabel={canManage ? t.inventory.materials.addTitle : undefined}
      />
    </>
  );
}
