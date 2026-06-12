import Link from "next/link";
import { FileText, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DocumentTypeBadge } from "@/components/documents/DocumentTypeBadge";
import { formatDate } from "@/lib/utils";
import type { PdfRecordListItem } from "@/lib/documents";

export function DocumentCard({
  record,
  labels,
}: {
  record: PdfRecordListItem;
  labels: { open: string };
}) {
  const fmtDateTime = (dt: Date) =>
    `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:border-accent/30">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <FileText className="size-4" strokeWidth={1.7} />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/documents/${record.id}`}
          className="text-sm font-medium text-text-primary transition-colors hover:text-accent"
        >
          <DocumentTypeBadge type={record.type} />
        </Link>
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
      <Link
        href={`/documents/${record.id}`}
        className="inline-flex h-8 items-center rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        {labels.open}
      </Link>
    </Card>
  );
}
