import Link from "next/link";
import { notFound } from "next/navigation";
import { User, ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getInvoiceForUser, paymentReceiverNames } from "@/lib/finance";
import { INVOICE_STATUS_META, PAYMENT_METHOD_META, formatInvoiceNumber } from "@/lib/constants";
import { PAYMENT_METHODS } from "@/lib/validation/finance";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { InvoiceItemsList } from "@/components/finance/InvoiceItemsList";
import { PaymentsList } from "@/components/finance/PaymentsList";
import { PaymentForm } from "@/components/finance/PaymentForm";
import { CancelInvoiceButton } from "@/components/finance/CancelInvoiceButton";
import { GenerateDocumentButton } from "@/components/documents/GenerateDocumentButton";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.view");
  const t = getDict(user.locale);
  const tf = t.finance;
  const { id } = await params;

  // tenant + ролевой scope: чужой счёт → 404
  const invoice = await getInvoiceForUser(user, id);
  if (!invoice) notFound();

  const canManage = hasPermission(user, "finance.manage");
  const canGeneratePdf = hasPermission(user, "documents.manage");
  const balance = invoice.total - invoice.paidAmount;
  const hasPayments = invoice.payments.length > 0 || invoice.paidAmount > 0;
  // v1: отмена только для счёта без оплат (paid/cancelled тем более не отменяются)
  const cancellable =
    canManage && !hasPayments && invoice.status !== "cancelled" && invoice.status !== "paid";
  const receiverNames = await paymentReceiverNames(
    user,
    invoice.payments.map((p) => p.receivedById),
  );

  return (
    <>
      <PageHeader
        title={`${tf.invoice.title} ${formatInvoiceNumber(invoice.number)}`}
        description={`${tf.invoice.issuedAt}: ${formatDate(invoice.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <Link
              href="/finance"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {t.modules.finance.title}
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/patients/${invoice.patient.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-3 py-1 text-text-primary transition-colors hover:text-accent"
        >
          <User className="size-3.5" /> {invoice.patient.lastName} {invoice.patient.firstName}
          {invoice.patient.phone && (
            <span className="tabular-nums text-text-secondary">· {invoice.patient.phone}</span>
          )}
        </Link>
        {invoice.doctor && (
          <span className="rounded-full bg-bg-elevated px-3 py-1 text-text-secondary">
            {tf.invoice.doctor}: {invoice.doctor.user.fullName}
          </span>
        )}
        {invoice.notes && (
          <span className="rounded-full bg-bg-elevated px-3 py-1 text-text-secondary">
            {invoice.notes}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-accent">{tf.invoice.items}</h2>
          <InvoiceItemsList
            items={invoice.items}
            totals={{
              subtotal: invoice.subtotal,
              discount: invoice.discount,
              total: invoice.total,
              paidAmount: invoice.paidAmount,
            }}
            labels={{
              subtotal: tf.invoice.subtotal,
              discount: tf.invoice.discount,
              total: tf.invoice.total,
              paidAmount: tf.invoice.paidAmount,
              balance: tf.invoice.balance,
            }}
          />
        </Card>

        <div className="space-y-4">
          {canManage && balance > 0 && invoice.status !== "cancelled" && (
            <Card className="border-accent/20 bg-accent/5 p-5">
              <PaymentForm
                invoiceId={invoice.id}
                maxAmount={balance}
                methods={PAYMENT_METHODS.map((m) => ({
                  value: m,
                  label: PAYMENT_METHOD_META[m].az,
                }))}
                labels={{ ...tf.payment }}
                errors={tf.errors}
              />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-accent">
              {tf.payment.history}{" "}
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
                {invoice.payments.length}
              </span>
            </h2>
            <PaymentsList
              payments={invoice.payments.map((p) => ({
                id: p.id,
                amount: p.amount,
                method: p.method,
                paidAt: p.paidAt,
                notes: p.notes,
                receivedByName: receiverNames.get(p.receivedById),
              }))}
              labels={{ historyEmpty: tf.payment.historyEmpty, received: tf.payment.received }}
            />
          </Card>

          {canGeneratePdf && (
            <Card className="p-5">
              <GenerateDocumentButton
                kind="invoice"
                targetId={invoice.id}
                labels={{
                  button: t.documents.generate.invoice,
                  saving: t.documents.generate.saving,
                }}
                errors={t.documents.errors}
              />
            </Card>
          )}
          {cancellable && (
            <Card className="border-danger/20 p-5">
              <CancelInvoiceButton
                invoiceId={invoice.id}
                labels={{ ...tf.cancel }}
                errors={tf.errors}
              />
            </Card>
          )}
          {canManage && hasPayments && invoice.status !== "cancelled" && (
            <p className="rounded-[10px] border border-border-subtle bg-bg-surface/60 px-3 py-2 text-xs text-text-secondary">
              {tf.cancel.hasPaymentsNote}
            </p>
          )}
          {invoice.status === "cancelled" && (
            <p className="rounded-[10px] border border-border-subtle bg-bg-surface/60 px-3 py-2 text-xs text-text-secondary">
              {tf.cancel.cancelledNote}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
