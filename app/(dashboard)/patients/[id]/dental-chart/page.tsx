import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Baby } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  getPatientDentalChart,
  getToothHistory,
  quadrantKey,
  ADULT_UPPER,
  ADULT_LOWER,
  CHILD_UPPER,
  CHILD_LOWER,
} from "@/lib/dental-chart";
import { lastToothTreatments } from "@/lib/treatments";
import { listToothRecordDocuments } from "@/lib/documents";
import { TOOTH_STATUS_META, TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TOOTH_STATUSES, TOOTH_PRIORITIES } from "@/lib/validation/dental-chart";
import { calcAge, cn, formatDate, formatMoney, isChildPatient } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ToothChart } from "@/components/dental-chart/ToothChart";
import { ToothPanel } from "@/components/dental-chart/ToothPanel";
import { toothStyle } from "@/components/dental-chart/status-styles";
import { ChildBadge, AllergyBadge } from "@/components/patients/PatientsTable";

export default async function PatientDentalChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tooth?: string }>;
}) {
  const user = await requirePermission("dental_chart.view");
  const t = getDict(user.locale);
  const dc = t.dentalChart;
  const { id } = await params;
  const sp = await searchParams;

  // scope: tenant + роль; чужой пациент → 404
  const data = await getPatientDentalChart(user, id);
  if (!data) notFound();
  const { patient, chart, records } = data;

  const canManage = hasPermission(user, "dental_chart.manage");
  const child = chart.chartType === "child";
  const upper = child ? CHILD_UPPER : ADULT_UPPER;
  const lower = child ? CHILD_LOWER : ADULT_LOWER;

  const selectedNumber = Number(sp.tooth) || null;
  const selected = selectedNumber
    ? records.find((r) => r.toothNumber === selectedNumber)
    : undefined;
  const history = selected ? await getToothHistory(user, selected.id) : [];
  const canViewTreatments = hasPermission(user, "treatments.view");
  const canManageTreatments = hasPermission(user, "treatments.manage");
  const toothTreatments =
    selected && canViewTreatments
      ? await lastToothTreatments(user, patient.id, selected.toothNumber)
      : [];
  const canViewDocuments = hasPermission(user, "documents.view");
  const toothDocuments =
    selected && canViewDocuments ? await listToothRecordDocuments(user, selected.id) : [];

  const basePath = `/patients/${patient.id}/dental-chart`;
  const age = calcAge(patient.birthDate);
  const statusLabels = Object.fromEntries(
    Object.entries(TOOTH_STATUS_META).map(([k, v]) => [k, v.az]),
  );

  // легенда: только статусы, встречающиеся на карте, + sağlam
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title={`${t.modules.dental_chart.title} — ${patient.lastName} ${patient.firstName}`}
        description={child ? dc.chartChild : dc.chartAdult}
        actions={
          <Link
            href={`/patients/${patient.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {patient.lastName} {patient.firstName}
          </Link>
        }
      />

      {/* контекст пациента */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        {age !== null && (
          <span className="rounded-full bg-bg-elevated px-2.5 py-0.5 text-xs">
            {age} {t.patients.table.yearsOld}
          </span>
        )}
        {isChildPatient(patient.birthDate, patient.guardianId) && (
          <ChildBadge label={t.patients.badges.child} />
        )}
        {patient.allergies && (
          <AllergyBadge label={`${t.patients.detail.allergies}: ${patient.allergies}`} />
        )}
        {patient.primaryDoctor && (
          <span className="rounded-full bg-bg-elevated px-2.5 py-0.5 text-xs">
            {t.patients.detail.doctor}: {patient.primaryDoctor.user.fullName}
          </span>
        )}
        {patient.guardian && (
          <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2.5 py-0.5 text-xs text-info">
            <Baby className="size-3" /> {patient.guardian.lastName} {patient.guardian.firstName} ·{" "}
            {patient.guardian.phone ?? "—"}
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
        {/* карта */}
        <Card className="p-4 sm:p-6">
          <ToothChart
            upper={upper}
            lower={lower}
            teeth={records.map((r) => ({ number: r.toothNumber, status: r.status }))}
            selected={selectedNumber}
            basePath={basePath}
            labels={{ upperJaw: dc.upperJaw, lowerJaw: dc.lowerJaw }}
          />
          {child && (
            <p className="mt-3 border-t border-border-subtle pt-3 text-center text-xs text-text-secondary">
              {dc.childNote}
            </p>
          )}
        </Card>

        {/* легенда */}
        <Card className="h-fit p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">{dc.legend}</h2>
          <ul className="space-y-1.5">
            {TOOTH_STATUSES.map((s) => (
              <li key={s} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 text-text-secondary">
                  <span className={cn("size-2 rounded-full", toothStyle(s).dot)} />
                  {statusLabels[s]}
                </span>
                {(counts.get(s) ?? 0) > 0 && (
                  <span className="tabular-nums text-text-primary">{counts.get(s)}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* slide-over карточка зуба (выбор — в URL: ?tooth=NN) */}
      {selected && (
        <ToothPanel
          record={{
            id: selected.id,
            patientId: patient.id,
            toothNumber: selected.toothNumber,
            status: selected.status,
            priority: selected.priority,
            diagnosis: selected.diagnosis,
            doctorNotes: selected.doctorNotes,
            lastTreatedAt: selected.lastTreatedAt ? formatDate(selected.lastTreatedAt) : null,
            doctorName: selected.doctor?.user.fullName ?? null,
            createdAt: formatDate(selected.createdAt),
            updatedAt: formatDate(selected.updatedAt),
          }}
          quadrantLabel={dc.quadrants[quadrantKey(selected.toothNumber)]}
          statusOptions={TOOTH_STATUSES.map((s) => ({ value: s, label: statusLabels[s] }))}
          priorityOptions={TOOTH_PRIORITIES.map((p) => ({ value: p, label: dc.priorities[p] }))}
          statusLabels={statusLabels}
          history={history.map((h) => ({
            id: h.id,
            previousStatus: h.previousStatus,
            newStatus: h.newStatus,
            diagnosis: h.diagnosis,
            procedureDone: h.procedureDone,
            doctorNote: h.doctorNote,
            changedByName: h.changedByName,
            createdAt: formatDate(h.createdAt),
          }))}
          canManage={canManage}
          labels={{ ...dc.panel, errorGeneric: dc.errors.generic }}
          closeHref={basePath}
          lastTreatments={toothTreatments.map((tr) => ({
            id: tr.id,
            date: formatDate(tr.performedAt ?? tr.createdAt),
            service: tr.service.name,
            status: TREATMENT_ITEM_STATUS_META[tr.status]?.az ?? tr.status,
            price: formatMoney(tr.price - tr.discount),
          }))}
          newTreatmentHref={
            canManageTreatments
              ? `/patients/${patient.id}/treatments/new?tooth=${selected.toothNumber}`
              : null
          }
          treatmentLabels={
            canViewTreatments
              ? {
                  title: t.treatments.toothPanel.lastTreatments,
                  empty: t.treatments.toothPanel.empty,
                  new: t.treatments.toothPanel.newTreatment,
                }
              : undefined
          }
          linkedDocuments={toothDocuments.map((doc) => ({
            id: doc.id,
            title: doc.title,
            type: doc.type,
            date: formatDate(doc.createdAt),
          }))}
          documentsLabels={canViewDocuments ? { ...dc.documents } : undefined}
        />
      )}
    </>
  );
}
