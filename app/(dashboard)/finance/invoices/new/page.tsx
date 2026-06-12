import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getPatientForUser, listPatientOptions } from "@/lib/patients";
import { listBillableItems } from "@/lib/finance";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { InvoiceCreateForm } from "@/components/finance/InvoiceCreateForm";

/**
 * Hesab yarat: без ?patientId — выбор пациента (GET-форма),
 * с ?patientId — список billable-процедур (done, без счёта) с чекбоксами.
 */
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const user = await requirePermission("finance.manage");
  const t = getDict(user.locale);
  const tf = t.finance;
  const { patientId } = await searchParams;

  if (!patientId) {
    const patients = await listPatientOptions(user);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={tf.createForm.title} description={tf.createForm.selectPatient} />
        <Card className="p-5">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <select
              name="patientId"
              required
              defaultValue=""
              className="h-10 min-w-64 flex-1 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent [&>option]:bg-bg-elevated"
            >
              <option value="" disabled>
                {tf.createForm.selectPatient}…
              </option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName} {p.firstName}
                  {p.phone ? ` · ${p.phone}` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-10 cursor-pointer rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90"
            >
              →
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const patient = await getPatientForUser(user, patientId);
  if (!patient) notFound();
  const billable = await listBillableItems(user, patient.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={tf.createForm.title}
        description={`${patient.lastName} ${patient.firstName} — ${tf.createForm.desc}`}
        actions={
          <Link
            href={`/patients/${patient.id}/finance`}
            className="text-sm text-text-secondary transition-colors hover:text-accent"
          >
            {tf.allFinance} →
          </Link>
        }
      />
      <InvoiceCreateForm
        patientId={patient.id}
        items={billable.map((b) => ({
          id: b.id,
          service: b.service.name,
          toothNumber: b.toothNumber,
          doctor: b.doctor.user.fullName,
          date: formatDate(b.performedAt ?? b.createdAt),
          amount: b.price - b.discount,
        }))}
        labels={{ ...tf.createForm }}
        errors={tf.errors}
        cancelHref={`/patients/${patient.id}/finance`}
      />
    </div>
  );
}
