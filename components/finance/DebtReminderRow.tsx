import Link from "next/link";
import { User } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { prepareInvoiceReminder } from "@/lib/actions/communications";
import { formatInvoiceNumber } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import type { DebtReminderCandidate } from "@/lib/finance";

export function DebtReminderRow({
  candidate,
  canManage,
  labels,
  errors,
}: {
  candidate: DebtReminderCandidate;
  canManage: boolean;
  labels: {
    paid: string;
    remaining: string;
    dueDate: string;
    lastReminder: string;
    neverReminded: string;
    action: string;
    preparedLabel: string;
    noPhone: string;
  };
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <Link
          href={`/finance/invoices/${candidate.invoice.id}`}
          className="flex items-center gap-1.5 font-medium text-text-primary transition-colors hover:text-accent"
        >
          <User className="size-3.5 text-text-secondary" />{" "}
          {`${candidate.patient.lastName} ${candidate.patient.firstName}`}
        </Link>
        <p className="mt-0.5 text-xs text-text-secondary">
          {formatInvoiceNumber(candidate.invoice.number)}
          {candidate.patient.phone && (
            <>
              {" · "}
              <span className="tabular-nums">{candidate.patient.phone}</span>
            </>
          )}
          {candidate.invoice.dueDate && (
            <>
              {" · "}
              {labels.dueDate}: {formatDate(candidate.invoice.dueDate)}
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {labels.lastReminder}:{" "}
          {candidate.lastReminderAt ? formatDate(candidate.lastReminderAt) : labels.neverReminded}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-text-secondary">
            {labels.paid}:{" "}
            <span className="tabular-nums">{formatMoney(candidate.invoice.paidAmount)}</span>
          </p>
          <p className="text-sm font-semibold tabular-nums text-warning">
            {labels.remaining}: {formatMoney(candidate.amount)}
          </p>
        </div>
        <InvoiceStatusBadge status={candidate.invoice.status} />
        {canManage && (
          <WhatsAppActionButton
            action={prepareInvoiceReminder}
            hiddenName="invoiceId"
            hiddenValue={candidate.invoice.id}
            label={labels.action}
            preparedLabel={labels.preparedLabel}
            noPhoneLabel={labels.noPhone}
            errors={errors}
            hasPhone={!!candidate.patient.phone}
            small
          />
        )}
      </div>
    </div>
  );
}
