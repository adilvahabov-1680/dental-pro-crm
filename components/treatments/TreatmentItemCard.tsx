import Link from "next/link";
import { User, Receipt, Package, CalendarPlus } from "lucide-react";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { TreatmentStatusBadge } from "@/components/treatments/TreatmentStatusBadge";
import { TreatmentStatusControl } from "@/components/treatments/TreatmentStatusControl";
import { formatInvoiceNumber } from "@/lib/constants";
import type { TreatmentItemFull } from "@/lib/treatments";
import { cn, formatDate, formatMoney } from "@/lib/utils";

export function TreatmentItemCard({
  item,
  canManage,
  statusOptions,
  labels,
  showPatient = false,
  materialsLabel,
  followUpLabel,
}: {
  item: TreatmentItemFull;
  canManage: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  labels: { tooth: string };
  showPatient?: boolean;
  /** метка «Material əlavə et» — ссылка на /treatments/[id]/materials (done/in_progress) */
  materialsLabel?: string;
  /** метка «Növbəti qəbul planla» — ссылка на /treatments/[id]/followup (planned/in_progress, без appointmentId) */
  followUpLabel?: string;
}) {
  const cancelled = item.status === "cancelled";
  const date = item.performedAt ?? item.createdAt;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3 transition-colors hover:border-accent/30 sm:flex-nowrap",
        cancelled && "opacity-60",
      )}
    >
      {/* дата + зуб */}
      <div className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-xl bg-bg-elevated/70 px-2 py-1.5">
        <span className="text-xs font-medium tabular-nums text-text-secondary">
          {formatDate(date)}
        </span>
        {item.toothNumber ? (
          <Link
            href={`/patients/${item.patient.id}/dental-chart?tooth=${item.toothNumber}`}
            className="flex items-center gap-1 text-sm font-semibold tabular-nums text-accent transition-opacity hover:opacity-80"
            title={`${labels.tooth} ${item.toothNumber}`}
          >
            <ToothIcon className="size-4" /> {item.toothNumber}
          </Link>
        ) : (
          <span className="text-xs text-text-secondary/50">—</span>
        )}
      </div>

      {/* услуга + пациент/врач + заметка */}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
          {item.service.name}
          {item.invoice && (
            // процедура уже выставлена в счёт — Hesabda
            <Link
              href={`/finance/invoices/${item.invoice.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success transition-opacity hover:opacity-80"
            >
              <Receipt className="size-3" /> {formatInvoiceNumber(item.invoice.number)}
            </Link>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
          {showPatient && (
            <Link
              href={`/patients/${item.patient.id}`}
              className="transition-colors hover:text-accent"
            >
              {item.patient.lastName} {item.patient.firstName}
            </Link>
          )}
          <span className="flex items-center gap-1">
            <User className="size-3" /> {item.doctor.user.fullName}
          </span>
          {item.notes && <span className="truncate text-text-secondary/80">{item.notes}</span>}
        </p>
        {item.materials.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
            <Package className="size-3 text-accent" />
            {item.materials.map((m) => (
              <span key={m.id} className="tabular-nums">
                {m.inventoryItem.name} ×{Number(m.quantity).toLocaleString("az-AZ", { maximumFractionDigits: 3 })}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* цена + статус */}
      <div className="flex shrink-0 items-center gap-3">
        {followUpLabel && ["planned", "in_progress"].includes(item.status) && !item.appointmentId && (
          <Link
            href={`/treatments/${item.id}/followup`}
            title={followUpLabel}
            className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
          >
            <CalendarPlus className="size-4" />
          </Link>
        )}
        {materialsLabel && ["done", "in_progress"].includes(item.status) && (
          <Link
            href={`/treatments/${item.id}/materials`}
            title={materialsLabel}
            className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
          >
            <Package className="size-4" />
          </Link>
        )}
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            cancelled ? "text-text-secondary line-through" : "text-text-primary",
          )}
        >
          {formatMoney(item.price - item.discount)}
        </span>
        {canManage ? (
          <TreatmentStatusControl
            treatmentItemId={item.id}
            status={item.status}
            options={statusOptions}
          />
        ) : (
          <TreatmentStatusBadge status={item.status} />
        )}
      </div>
    </div>
  );
}
