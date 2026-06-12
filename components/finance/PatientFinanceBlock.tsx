import Link from "next/link";
import { Wallet, Plus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InvoiceCard } from "@/components/finance/InvoiceCard";
import { PaymentsList } from "@/components/finance/PaymentsList";
import type { InvoiceListItem } from "@/lib/finance";
import { formatMoney } from "@/lib/utils";
import type { Dict } from "@/i18n/az";

/** Живой блок «Ödənişlər» на карточке пациента. */
export function PatientFinanceBlock({
  patientId,
  dict,
  invoices,
  payments,
  invoiced,
  paid,
  debt,
  canManage,
}: {
  patientId: string;
  dict: Dict["finance"];
  invoices: InvoiceListItem[];
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    paidAt: Date;
    notes: string | null;
    invoiceNumber?: string;
  }>;
  invoiced: number;
  paid: number;
  debt: number;
  canManage: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Wallet className="size-4" /> {dict.patientBlock.title}
          {debt > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
              <TriangleAlert className="size-3" /> {dict.patientBlock.debtBadge}:{" "}
              <span className="tabular-nums">{formatMoney(debt)}</span>
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link
              href={`/finance/invoices/new?patientId=${patientId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-linear-to-br from-accent to-accent-deep px-3 text-xs font-semibold text-bg-base transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" /> {dict.newInvoice}
            </Link>
          )}
          <Link
            href={`/patients/${patientId}/finance`}
            className="text-xs text-text-secondary transition-colors hover:text-accent"
          >
            {dict.allFinance} →
          </Link>
        </div>
      </div>

      {invoices.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
          {dict.patientBlock.empty}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
            <span>
              {dict.patientBlock.invoiced}:{" "}
              <span className="font-semibold tabular-nums text-text-primary">
                {formatMoney(invoiced)}
              </span>
            </span>
            <span>
              {dict.patientBlock.paid}:{" "}
              <span className="font-semibold tabular-nums text-success">{formatMoney(paid)}</span>
            </span>
            <span>
              {dict.patientBlock.debt}:{" "}
              <span
                className={`font-semibold tabular-nums ${debt > 0 ? "text-warning" : "text-success"}`}
              >
                {formatMoney(debt)}
              </span>
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-text-secondary">{dict.patientBlock.recentInvoices}</p>
              <div className="space-y-2">
                {invoices.slice(0, 3).map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    labels={{ balance: dict.invoice.balance, paidAmount: dict.invoice.paidAmount }}
                    showPatient={false}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-text-secondary">{dict.patientBlock.recentPayments}</p>
              <PaymentsList
                payments={payments.slice(0, 3)}
                labels={{ historyEmpty: dict.payment.historyEmpty, received: dict.payment.received }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
