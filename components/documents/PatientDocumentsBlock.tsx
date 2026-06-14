import Link from "next/link";
import { FileText, FileDown, UserSquare2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DocumentTypeBadge } from "@/components/documents/DocumentTypeBadge";
import { GenerateDocumentButton } from "@/components/documents/GenerateDocumentButton";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";
import { DeleteDocumentButton } from "@/components/documents/DeleteDocumentButton";
import { WhatsAppActionButton } from "@/components/communications/WhatsAppActionButton";
import { prepareDocumentMessage } from "@/lib/actions/communications";
import { formatDate } from "@/lib/utils";
import type { PatientDocumentRow } from "@/lib/documents";

/**
 * Блок «Sənədlər» на карточке пациента:
 * генерация «Müalicə çıxarışı», загрузка файла (сессия 14), ссылка на финансы
 * для hesab-PDF, последние записи documents/pdf_records.
 */
export function PatientDocumentsBlock({
  patientId,
  patientPhone,
  records,
  canManage,
  typeOptions,
  labels,
  generateLabels,
  uploadLabels,
  deleteLabels,
  errors,
  whatsappLabels,
  communicationErrors,
}: {
  patientId: string;
  patientPhone: string | null;
  records: PatientDocumentRow[];
  canManage: boolean;
  typeOptions: Array<{ value: string; label: string }>;
  labels: {
    title: string;
    soon: string;
    note: string;
    plannedInfoForm: string;
    invoiceDoc: string;
    invoiceDocHint: string;
    recent: string;
    empty: string;
    all: string;
  };
  generateLabels: { summary: string; saving: string };
  uploadLabels: {
    title: string;
    file: string;
    typeLabel: string;
    titleLabel: string;
    titleHint: string;
    submit: string;
    uploading: string;
    success: string;
    hint: string;
  };
  deleteLabels: { button: string; confirm: string; failed: string };
  errors: Record<string, string>;
  whatsappLabels: { documentMessage: string; prepared: string; noPhone: string };
  communicationErrors: Record<string, string>;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <FileText className="size-4" /> {labels.title}
        </h2>
        <Link
          href={`/patients/${patientId}/documents`}
          className="text-xs text-text-secondary transition-colors hover:text-accent"
        >
          {labels.all} →
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {canManage && (
            <GenerateDocumentButton
              kind="summary"
              targetId={patientId}
              labels={{ button: generateLabels.summary, saving: generateLabels.saving }}
              errors={errors}
            />
          )}
          <Link
            href={`/patients/${patientId}/finance`}
            className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <FileDown className="size-4 text-text-secondary" strokeWidth={1.7} />{" "}
              {labels.invoiceDoc}
            </span>
            <span className="text-[11px] text-text-secondary">{labels.invoiceDocHint} →</span>
          </Link>
          <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 opacity-70">
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <UserSquare2 className="size-4 text-text-secondary" strokeWidth={1.7} />{" "}
              {labels.plannedInfoForm}
            </span>
            <Badge tone="neutral">{labels.soon}</Badge>
          </div>
          {canManage && (
            <div className="mt-3 rounded-[10px] border border-border-subtle bg-bg-base/40 p-3">
              <p className="mb-2 text-xs font-medium text-text-primary">{uploadLabels.title}</p>
              <UploadDocumentForm
                patientId={patientId}
                typeOptions={typeOptions}
                labels={uploadLabels}
                errors={errors}
                compact
              />
            </div>
          )}
          <p className="pt-1 text-[11px] leading-relaxed text-text-secondary/80">{labels.note}</p>
        </div>
        <div>
          <p className="mb-2 text-xs text-text-secondary">{labels.recent}</p>
          {records.length === 0 ? (
            <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-3 text-center text-xs text-text-secondary">
              {labels.empty}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {records.map((r) =>
                r.pdfRecordId ? (
                  <li key={r.id}>
                    <Link
                      href={`/documents/${r.pdfRecordId}`}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2 transition-colors hover:bg-bg-elevated"
                    >
                      <DocumentTypeBadge type={r.type} />
                      <span className="text-[11px] tabular-nums text-text-secondary">
                        {formatDate(r.createdAt)}
                      </span>
                    </Link>
                  </li>
                ) : (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
                  >
                    <a
                      href={`/api/documents/${r.id}/download`}
                      target="_blank"
                      rel="noopener"
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 transition-colors hover:text-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <DocumentTypeBadge type={r.type} />
                        <span className="min-w-0 truncate text-xs text-text-primary">{r.title}</span>
                      </span>
                      <span className="text-[11px] tabular-nums text-text-secondary">
                        {formatDate(r.createdAt)}
                      </span>
                    </a>
                    {canManage && (
                      <WhatsAppActionButton
                        action={prepareDocumentMessage}
                        hiddenName="documentId"
                        hiddenValue={r.id}
                        label={whatsappLabels.documentMessage}
                        preparedLabel={whatsappLabels.prepared}
                        noPhoneLabel={whatsappLabels.noPhone}
                        errors={communicationErrors}
                        hasPhone={!!patientPhone}
                        small
                      />
                    )}
                    {canManage && (
                      <DeleteDocumentButton documentId={r.id} labels={deleteLabels} small />
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
