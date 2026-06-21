import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  CalendarPlus,
  FileDown,
  CalendarDays,
  Phone,
  Baby,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser, listClinicDoctors } from "@/lib/patients";
import { listPatientAppointments } from "@/lib/appointments";
import { listPatientTreatments } from "@/lib/treatments";
import { listPatientFinance } from "@/lib/finance";
import { listPatientDocumentRecords, listPatientLinkOptions } from "@/lib/documents";
import { listPatientCommunications, COMMUNICATION_CHANNELS } from "@/lib/communications";
import { prepareAppointmentReminder } from "@/lib/actions/communications";
import { listPatientFeedback } from "@/lib/patient-feedback";
import { prepareFeedbackLinkAction } from "@/lib/actions/patient-feedback";
import { UPLOAD_DOCUMENT_TYPES } from "@/lib/validation/documents";
import { DOCUMENT_TYPE_META, COMMUNICATION_CHANNEL_META } from "@/lib/constants";
import { PatientDocumentsBlock } from "@/components/documents/PatientDocumentsBlock";
import { CommunicationHistoryBlock } from "@/components/communications/CommunicationHistoryBlock";
import { PatientFeedbackBlock } from "@/components/patients/PatientFeedbackBlock";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentStatusBadge";
import { RescheduleOptionsForm } from "@/components/appointments/RescheduleOptionsForm";
import { PatientTreatmentBlock } from "@/components/treatments/PatientTreatmentBlock";
import { PatientFinanceBlock } from "@/components/finance/PatientFinanceBlock";
import { formatInvoiceNumber } from "@/lib/constants";
import { TREATMENT_ITEM_STATUS_META } from "@/lib/constants";
import { TREATMENT_ITEM_STATUSES } from "@/lib/validation/treatments";
import { calcAge, formatDate, isChildPatient } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { ChildBadge, AllergyBadge } from "@/components/patients/PatientsTable";
import { AssignDoctorForm } from "@/components/patients/AssignDoctorForm";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm text-text-primary">{value ?? "—"}</span>
    </div>
  );
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("patients.view");
  const t = getDict(user.locale);
  const d = t.patients.detail;
  const { id } = await params;

  // tenant + ролевой scope: чужой пациент → 404
  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const canManage = hasPermission(user, "patients.manage");
  const canAssignDoctor = hasPermission(user, "admin.manage");
  const doctorOptions = canAssignDoctor ? await listClinicDoctors(user) : [];
  const canManageAppointments = hasPermission(user, "appointments.manage");
  const canViewAppointments = hasPermission(user, "appointments.view");
  const appts = canViewAppointments
    ? await listPatientAppointments(user, patient.id)
    : { upcoming: null, recent: [], total: 0 };
  const canManageTreatments = hasPermission(user, "treatments.manage");
  const canViewTreatments = hasPermission(user, "treatments.view");
  const treatments = canViewTreatments
    ? await listPatientTreatments(user, patient.id)
    : { plans: [], items: [], total: 0, activeAmount: 0, doneAmount: 0 };
  const activePlan =
    treatments.plans.find((p) => p.status === "in_progress") ?? treatments.plans[0] ?? null;
  const canManageFinance = hasPermission(user, "finance.manage");
  const canViewFinance = hasPermission(user, "finance.view");
  const finance = canViewFinance
    ? await listPatientFinance(user, patient.id)
    : { invoices: [], payments: [], invoiced: 0, paid: 0, debt: 0 };
  const canViewDocuments = hasPermission(user, "documents.view");
  const canManageDocuments = hasPermission(user, "documents.manage");
  const documentRecords = canViewDocuments
    ? await listPatientDocumentRecords(user, patient.id)
    : [];
  const documentLinkOptions = canManageDocuments
    ? await listPatientLinkOptions(user, patient.id)
    : { teeth: [], treatments: [] };
  const documentToothOptions = documentLinkOptions.teeth.map((tr) => ({
    value: tr.id,
    label: `${t.documents.list.tooth} ${tr.toothNumber}`,
  }));
  const documentTreatmentOptions = documentLinkOptions.treatments.map((ti) => ({
    value: ti.id,
    label: ti.toothNumber
      ? `${ti.serviceName} (${t.documents.list.tooth} ${ti.toothNumber})`
      : ti.serviceName,
  }));
  const communications = await listPatientCommunications(user, patient.id);
  const feedbackRows = await listPatientFeedback(user, patient.id);
  const age = calcAge(patient.birthDate);
  const child = isChildPatient(patient.birthDate, patient.guardianId);
  const genderLabel = { male: t.patients.filters.male, female: t.patients.filters.female };

  const fmtDateTime = (dt: Date) =>
    `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <>
      <PageHeader
        title={`${patient.lastName} ${patient.firstName}${patient.fatherName ? ` ${patient.fatherName}` : ""}`}
        description={`${d.registered}: ${formatDate(patient.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Link
                href={`/patients/${patient.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Pencil className="size-4" /> {d.edit}
              </Link>
            )}
            {canManageAppointments && (
              <Link
                href={`/appointments/new?patient=${patient.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
              >
                <CalendarPlus className="size-4" /> {d.newAppointment}
              </Link>
            )}
            <Link
              href={`/patients/${patient.id}/dental-chart`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ToothIcon className="size-4" /> {d.toothChart}
            </Link>
            <Link
              href={`/patients/${patient.id}/documents`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <FileDown className="size-4" /> {d.pdf}
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {child && <ChildBadge label={t.patients.badges.child} />}
        {patient.allergies && <AllergyBadge label={`${d.allergies}: ${patient.allergies}`} />}
        {patient.status === "archived" && (
          <Badge tone="neutral">{t.patients.filters.archived}</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Əsas məlumat */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-accent">{d.info}</h2>
          <div className="divide-y divide-border-subtle/50">
            <InfoRow label={d.phone} value={patient.phone} />
            <InfoRow label={d.email} value={patient.email} />
            <InfoRow
              label={d.age}
              value={age !== null ? `${age} ${t.patients.table.yearsOld}` : null}
            />
            <InfoRow
              label={d.birthDate}
              value={patient.birthDate ? formatDate(patient.birthDate) : null}
            />
            <InfoRow label={d.gender} value={patient.gender ? genderLabel[patient.gender] : null} />
            <InfoRow label={d.address} value={patient.address} />
            <div className="flex items-start justify-between gap-4 py-1.5">
              <span className="text-sm text-text-secondary">{t.admin.assignment.primaryDoctor}</span>
              <div className="flex flex-col items-end gap-1">
                <span className="text-right text-sm text-text-primary">
                  {patient.primaryDoctor?.user.fullName ?? t.admin.assignment.notAssigned}
                </span>
                {canAssignDoctor && (
                  <AssignDoctorForm
                    patientId={patient.id}
                    currentDoctorId={patient.primaryDoctorId ?? null}
                    doctors={doctorOptions.map((d) => ({ id: d.id, name: d.user.fullName }))}
                    labels={t.admin.assignment}
                    errorLabels={t.admin.errors}
                  />
                )}
              </div>
            </div>
            <InfoRow
              label={d.type}
              value={child ? t.patients.filters.child : t.patients.filters.adult}
            />
            <InfoRow label={d.source} value={patient.source} />
            <InfoRow label={d.notes} value={patient.notes} />
          </div>
        </Card>

        <div className="space-y-4">
          {/* Tibbi məlumat */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-accent">{d.medical}</h2>
            <div className="divide-y divide-border-subtle/50">
              <InfoRow
                label={d.allergies}
                value={
                  patient.allergies ? (
                    <span className="font-medium text-warning">{patient.allergies}</span>
                  ) : null
                }
              />
              <InfoRow label={d.chronicDiseases} value={patient.chronicDiseases} />
              <InfoRow label={d.anamnesis} value={patient.anamnesis} />
            </div>
          </Card>

          {/* Himayəçi (для ребёнка) */}
          {patient.guardian && (
            <Card className="border-info/30 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-info">
                <Baby className="size-4" /> {d.guardian}
              </h2>
              <Link
                href={`/patients/${patient.guardian.id}`}
                className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-bg-elevated"
              >
                <span className="text-sm font-medium text-text-primary">
                  {patient.guardian.lastName} {patient.guardian.firstName}
                </span>
                <span className="flex items-center gap-1.5 text-sm tabular-nums text-text-secondary">
                  <Phone className="size-3.5" /> {patient.guardian.phone ?? "—"}
                </span>
              </Link>
            </Card>
          )}

          {/* Дети опекуна */}
          {patient.children.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
                <Baby className="size-4" /> {d.childrenOf}
              </h2>
              <ul className="space-y-1">
                {patient.children.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/patients/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 text-sm transition-colors hover:bg-bg-elevated"
                    >
                      <span className="text-text-primary">
                        {c.lastName} {c.firstName}
                      </span>
                      <span className="tabular-nums text-text-secondary">
                        {calcAge(c.birthDate) !== null
                          ? `${calcAge(c.birthDate)} ${t.patients.table.yearsOld}`
                          : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Qəbullar — живой блок */}
      {canViewAppointments && (
        <Card className="mt-4 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
              <CalendarDays className="size-4" /> {t.appointments.patientBlock.title}
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
                {appts.total}
              </span>
            </h2>
            <Link
              href={`/appointments?view=list&q=${encodeURIComponent(patient.lastName)}`}
              className="text-xs text-text-secondary transition-colors hover:text-accent"
            >
              {t.appointments.patientBlock.all} →
            </Link>
          </div>
          {appts.total === 0 ? (
            <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
              {t.appointments.patientBlock.empty}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-text-secondary">
                  {t.appointments.patientBlock.upcoming}
                </p>
                {appts.upcoming ? (
                  <div className="rounded-[10px] border border-accent/30 bg-accent/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums text-accent">
                        {fmtDateTime(appts.upcoming.startsAt)}
                      </span>
                      <AppointmentStatusBadge status={appts.upcoming.status} />
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {appts.upcoming.doctor.user.fullName}
                      {appts.upcoming.complaint && ` · ${appts.upcoming.complaint}`}
                    </p>
                    {canManageAppointments && (
                      <div className="mt-2">
                        <WhatsAppActionButton
                          action={prepareAppointmentReminder}
                          hiddenName="appointmentId"
                          hiddenValue={appts.upcoming.id}
                          label={t.communications.whatsapp.appointmentReminder}
                          preparedLabel={t.communications.whatsapp.prepared}
                          noPhoneLabel={t.communications.errors.noPhone}
                          errors={t.communications.errors}
                          hasPhone={!!patient.phone}
                          small
                        />
                      </div>
                    )}
                    {canManageAppointments && appts.upcoming.status === "reschedule_requested" && (
                      <RescheduleOptionsForm
                        appointmentId={appts.upcoming.id}
                        alreadySent={appts.rescheduleOptionsSent}
                        labels={t.rescheduleOptions.staff}
                      />
                    )}
                  </div>
                ) : (
                  <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
                    —
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-text-secondary">
                  {t.appointments.patientBlock.recent}
                </p>
                <ul className="space-y-1.5">
                  {appts.recent.length === 0 && (
                    <li className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
                      —
                    </li>
                  )}
                  {appts.recent.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
                    >
                      <span className="text-xs tabular-nums text-text-primary">
                        {fmtDateTime(a.startsAt)}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {a.doctor.user.fullName}
                      </span>
                      <AppointmentStatusBadge status={a.status} />
                      {canManage && a.status === "completed" && (
                        <WhatsAppActionButton
                          action={prepareFeedbackLinkAction}
                          hiddenName="appointmentId"
                          hiddenValue={a.id}
                          label={t.patientFeedback.staff.createLabel}
                          preparedLabel={t.communications.whatsapp.prepared}
                          noPhoneLabel={t.communications.errors.noPhone}
                          errors={t.patientFeedback.staff.errors}
                          hasPhone={!!patient.phone}
                          small
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Müalicə — живой блок */}
      {canViewTreatments && (
        <div className="mt-4">
          <PatientTreatmentBlock
            patientId={patient.id}
            dict={t.treatments}
            items={treatments.items}
            activePlan={
              activePlan
                ? {
                    id: activePlan.id,
                    title: activePlan.title,
                    status: activePlan.status,
                    totalPrice: activePlan.totalPrice,
                    itemsCount: activePlan._count.items,
                  }
                : null
            }
            total={treatments.total}
            activeAmount={treatments.activeAmount}
            doneAmount={treatments.doneAmount}
            canManage={canManageTreatments}
            statusOptions={TREATMENT_ITEM_STATUSES.map((v) => ({
              value: v,
              label: TREATMENT_ITEM_STATUS_META[v].az,
            }))}
          />
        </div>
      )}

      {/* Ödənişlər — живой блок */}
      {canViewFinance && (
        <div className="mt-4">
          <PatientFinanceBlock
            patientId={patient.id}
            dict={t.finance}
            invoices={finance.invoices}
            payments={finance.payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              paidAt: p.paidAt,
              notes: p.notes,
              invoiceNumber: p.invoice ? formatInvoiceNumber(p.invoice.number) : undefined,
            }))}
            invoiced={finance.invoiced}
            paid={finance.paid}
            debt={finance.debt}
            canManage={canManageFinance}
          />
        </div>
      )}

      {/* Sənədlər — живой блок: генерация PDF + последние документы */}
      {canViewDocuments && (
        <div className="mt-4">
          <PatientDocumentsBlock
            patientId={patient.id}
            patientPhone={patient.phone}
            records={documentRecords}
            canManage={canManageDocuments}
            typeOptions={UPLOAD_DOCUMENT_TYPES.map((v) => ({
              value: v,
              label: DOCUMENT_TYPE_META[v].az,
            }))}
            toothOptions={documentToothOptions}
            treatmentOptions={documentTreatmentOptions}
            linkLabels={{ tooth: t.documents.list.tooth, treatment: t.documents.list.treatment }}
            labels={{ ...t.documents.patientBlock }}
            generateLabels={{
              summary: t.documents.generate.summary,
              saving: t.documents.generate.saving,
            }}
            uploadLabels={{ ...t.documents.upload }}
            deleteLabels={{
              button: t.documents.delete.button,
              confirm: t.documents.delete.confirm,
              failed: t.documents.delete.failed,
            }}
            errors={t.documents.errors}
            whatsappLabels={{
              documentMessage: t.communications.whatsapp.documentMessage,
              prepared: t.communications.whatsapp.prepared,
              noPhone: t.communications.errors.noPhone,
            }}
            communicationErrors={t.communications.errors}
          />
        </div>
      )}

      {/* Əlaqə tarixçəsi — сессия 15 */}
      <div className="mt-4">
        <CommunicationHistoryBlock
          patientId={patient.id}
          rows={communications}
          canManage={canManage}
          channelOptions={COMMUNICATION_CHANNELS.map((c) => ({
            value: c,
            label: COMMUNICATION_CHANNEL_META[c]?.az ?? c,
          }))}
          labels={{ ...t.communications.history }}
          errors={t.communications.errors}
        />
      </div>

      {/* Son rəylər — сессия 45 */}
      <div className="mt-4">
        <PatientFeedbackBlock
          rows={feedbackRows}
          labels={{ title: t.patientFeedback.list.blockTitle, empty: t.patientFeedback.list.empty }}
        />
      </div>
    </>
  );
}
