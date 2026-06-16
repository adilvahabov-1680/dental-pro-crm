import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser, listClinicDoctors } from "@/lib/patients";
import { listPatientTreatments } from "@/lib/treatments";
import { listActiveProtocols } from "@/lib/protocols";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES } from "@/lib/validation/treatments";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { TreatmentItemsList } from "@/components/treatments/TreatmentItemsList";
import { TreatmentPlanSummary } from "@/components/treatments/TreatmentPlanSummary";
import { PlanCreateForm } from "@/components/treatments/PlanCreateForm";
import { ApplyProtocolForm } from "@/components/protocols/ApplyProtocolForm";

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
  const [{ plans, items, total, activeAmount, doneAmount }, protocols, doctors] =
    await Promise.all([
      listPatientTreatments(user, patient.id),
      listActiveProtocols(user),
      listClinicDoctors(user),
    ]);

  const statusOptions = TREATMENT_ITEM_STATUSES.map((v) => ({
    value: v,
    label: TREATMENT_ITEM_STATUS_META[v].az,
  }));

  // default doctorId for protocol apply and follow-up forms
  const defaultDoctorId =
    (user.role === "doctor" ? user.doctorId : null) ??
    (user.role === "assistant" ? user.assignedDoctorId : null) ??
    doctors[0]?.id ??
    "";

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
        <div className="mb-4 space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="space-y-2">
              <TreatmentPlanSummary
                plan={{
                  id: p.id,
                  title: p.title,
                  status: p.status,
                  totalPrice: p.totalPrice,
                  itemsCount: p._count.items,
                }}
                labels={{ items: tt.plan.items, total: tt.plan.total }}
              />
              {canManage && protocols.length > 0 && !["cancelled", "completed"].includes(p.status) && (
                <ApplyProtocolForm
                  patientId={patient.id}
                  treatmentPlanId={p.id}
                  doctorId={defaultDoctorId}
                  protocols={protocols}
                  labels={{
                    applyTitle: t.settings.protocols.applyTitle,
                    applyDesc: t.settings.protocols.applyDesc,
                    applySelect: t.settings.protocols.applySelect,
                    applyBtn: t.settings.protocols.applyBtn,
                    applying: t.settings.protocols.applying,
                    applied: t.settings.protocols.applied,
                    error: t.settings.errors.generic,
                  }}
                />
              )}
            </div>
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
        followUpLabel={canManage ? t.settings.protocols.followUpTitle : undefined}
      />
    </>
  );
}
