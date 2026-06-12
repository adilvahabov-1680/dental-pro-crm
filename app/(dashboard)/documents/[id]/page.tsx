import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileWarning, User } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getDocumentForUser, documentCreatorNames } from "@/lib/documents";
import { readUploadFile } from "@/lib/storage";
import { formatInvoiceNumber } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DocumentTypeBadge } from "@/components/documents/DocumentTypeBadge";
import { PDF_TYPE_META } from "@/lib/constants";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("documents.view");
  const t = getDict(user.locale);
  const td = t.documents.detail;
  const { id } = await params;

  // tenant + ролевой scope: чужой документ → 404
  const record = await getDocumentForUser(user, id);
  if (!record) notFound();

  const [names, file] = await Promise.all([
    documentCreatorNames(user, [record.generatedById]),
    readUploadFile(record.fileUrl),
  ]);
  const downloadUrl = `/api/documents/${record.id}/download`;
  const fmtDateTime = (dt: Date) =>
    `${formatDate(dt)} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex items-start justify-between gap-4 py-1.5">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-right text-sm text-text-primary">{value ?? "—"}</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={PDF_TYPE_META[record.type]?.az ?? record.type}
        description={fmtDateTime(record.createdAt)}
        actions={
          <div className="flex items-center gap-2">
            {file && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
              >
                <ExternalLink className="size-4" /> {td.open}
              </a>
            )}
            <Link
              href="/documents"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {td.backToList}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-accent">{td.meta}</h2>
          <div className="divide-y divide-border-subtle/50">
            <InfoRow label={td.typeLabel} value={<DocumentTypeBadge type={record.type} />} />
            <InfoRow
              label={td.patient}
              value={
                record.patient ? (
                  <Link
                    href={`/patients/${record.patient.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <User className="size-3.5" /> {record.patient.lastName}{" "}
                    {record.patient.firstName}
                  </Link>
                ) : null
              }
            />
            <InfoRow label={td.created} value={fmtDateTime(record.createdAt)} />
            <InfoRow label={td.createdBy} value={names.get(record.generatedById)} />
            <InfoRow
              label={td.source}
              value={
                record.sourceEntity === "invoice" ? (
                  <Link
                    href={`/finance/invoices/${record.sourceId}`}
                    className="text-accent hover:underline"
                  >
                    {t.finance.invoice.title}
                  </Link>
                ) : (
                  record.sourceEntity
                )
              }
            />
          </div>
        </Card>

        <Card className="overflow-hidden p-0 lg:col-span-2">
          {file ? (
            <iframe
              src={downloadUrl}
              title={td.preview}
              className="h-[70vh] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                <FileWarning className="size-6" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-text-secondary">{td.fileMissing}</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
