import Link from "next/link";
import { FileText, Paperclip, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DocumentTypeBadge } from "@/components/documents/DocumentTypeBadge";
import { DeleteDocumentButton } from "@/components/documents/DeleteDocumentButton";
import { formatDate } from "@/lib/utils";
import type { DocumentListRow } from "@/lib/documents";

/**
 * Карточка строки списка документов: сгенерированный PDF (kind=pdf,
 * детальная страница /documents/[id]) или загруженный файл (kind=upload,
 * открывается напрямую через защищённый download-route).
 */
/** mime изображений с превью через защищённый download-route (сессия 19) */
const PREVIEW_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function DocumentCard({
  record,
  labels,
  canDelete = false,
  deleteLabels,
  linkLabels,
}: {
  record: DocumentListRow;
  labels: { open: string; download: string };
  /** documents.manage; «Sil» — только для загруженных файлов (kind=upload) */
  canDelete?: boolean;
  deleteLabels?: { button: string; confirm: string; failed: string };
  /** подписи для бейджей привязки к зубу/процедуре (сессия 19) */
  linkLabels?: { tooth: string; treatment: string };
}) {
  const fmtDateTime = (dt: Date) =>
    `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  const isPdf = record.kind === "pdf";
  const href = isPdf ? `/documents/${record.id}` : `/api/documents/${record.id}/download`;
  const actionLabel = isPdf ? labels.open : labels.download;

  const Action = isPdf ? (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
    >
      {actionLabel}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex h-8 items-center rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
    >
      {actionLabel}
    </a>
  );

  const canPreview = !isPdf && PREVIEW_MIME.has(record.mimeType ?? "");

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:border-accent/30">
      {canPreview ? (
        <a href={href} target="_blank" rel="noopener" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={record.title ?? ""}
            className="size-9 rounded-xl border border-border-subtle object-cover"
          />
        </a>
      ) : (
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
            isPdf ? "bg-accent/10 text-accent" : "bg-info/10 text-info"
          }`}
        >
          {isPdf ? (
            <FileText className="size-4" strokeWidth={1.7} />
          ) : (
            <Paperclip className="size-4" strokeWidth={1.7} />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentTypeBadge type={record.type} />
          {record.title && (
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">
              {record.title}
            </span>
          )}
          {linkLabels && record.toothNumber && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
              {linkLabels.tooth} {record.toothNumber}
            </span>
          )}
          {linkLabels && record.treatmentLabel && (
            <span className="rounded-full bg-info/10 px-2 py-0.5 text-[11px] text-info">
              {linkLabels.treatment}: {record.treatmentLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] tabular-nums text-text-secondary">
          {fmtDateTime(record.createdAt)}
        </p>
      </div>
      {record.patient && (
        <Link
          href={`/patients/${record.patient.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-3 py-1 text-xs text-text-primary transition-colors hover:text-accent"
        >
          <User className="size-3" /> {record.patient.lastName} {record.patient.firstName}
        </Link>
      )}
      {Action}
      {!isPdf && canDelete && deleteLabels && (
        <DeleteDocumentButton documentId={record.id} labels={deleteLabels} />
      )}
    </Card>
  );
}
