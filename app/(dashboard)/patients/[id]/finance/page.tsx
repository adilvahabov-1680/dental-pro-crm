import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, FileX } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser } from "@/lib/patients";
import { listPatientFinance, paymentReceiverNames } from "@/lib/finance";
import { formatInvoiceNumber } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InvoiceCard } from "@/components/finance/InvoiceCard";
import { PaymentsList } from "@/components/finance/PaymentsList";

export default async function PatientFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.view");
  const t = getDict(user.locale);
  const tf = t.finance;
  const { id } = await params;

  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const canManage = hasPermission(user, "finance.manage");
  const { invoices, payments, invoiced, paid, debt } = await listPatientFinance(user, patient.id);
  const receiverNames = await paymentReceiverNames(
    user,
    payments.map((p) => p.receivedById),
  );

  return (
    <>
      <PageHeader
        title={`${tf.patientBlock.title} — ${patient.lastName} ${patient.firstName}`}
        description={`${tf.patientBlock.invoiced}: ${formatMoney(invoiced)} · ${tf.patientBlock.paid}: ${formatMoney(paid)} · ${tf.patientBlock.debt}: ${formatMoney(debt)}`}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <Link
                href={`/finance/invoices/new?patientId=${patient.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" /> {tf.newInvoice}
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

      {invoices.length === 0 ? (
        <Card>
          <EmptyState icon={FileX} title={tf.empty.title} description={tf.empty.desc} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {invoices.map((inv) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                labels={{ balance: tf.invoice.balance, paidAmount: tf.invoice.paidAmount }}
                showPatient={false}
              />
            ))}
          </div>
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold text-accent">{tf.payment.history}</h2>
            <PaymentsList
              payments={payments.map((p) => ({
                id: p.id,
                amount: p.amount,
                method: p.method,
                paidAt: p.paidAt,
                notes: p.notes,
                receivedByName: receiverNames.get(p.receivedById),
                invoiceNumber: p.invoice ? formatInvoiceNumber(p.invoice.number) : undefined,
              }))}
              labels={{ historyEmpty: tf.payment.historyEmpty, received: tf.payment.received }}
            />
          </Card>
        </div>
      )}
    </>
  );
}
