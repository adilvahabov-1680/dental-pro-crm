import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser } from "@/lib/patients";
import { listPatientDocuments } from "@/lib/documents";
import { UPLOAD_DOCUMENT_TYPES } from "@/lib/validation/documents";
import { DOCUMENT_TYPE_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DocumentsList } from "@/components/documents/DocumentsList";
import { GenerateDocumentButton } from "@/components/documents/GenerateDocumentButton";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";

export default async function PatientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("documents.view");
  const t = getDict(user.locale);
  const td = t.documents;
  const { id } = await params;

  // tenant + ролевой scope: чужой пациент → 404
  const patient = await getPatientForUser(user, id);
  if (!patient) notFound();

  const canManage = hasPermission(user, "documents.manage");
  const records = await listPatientDocuments(user, patient.id);

  return (
    <>
      <PageHeader
        title={`${td.patientBlock.title} — ${patient.lastName} ${patient.firstName}`}
        description={t.modules.documents.desc}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <GenerateDocumentButton
                kind="summary"
                targetId={patient.id}
                labels={{ button: td.generate.summary, saving: td.generate.saving }}
                errors={td.errors}
                variant="primary"
              />
            )}
            <Link
              href={`/patients/${patient.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {t.patients.table.view}
            </Link>
          </div>
        }
      />
      {canManage && (
        <Card className="mb-4 border-accent/20 bg-accent/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-accent">{td.upload.title}</h2>
          <UploadDocumentForm
            patientId={patient.id}
            typeOptions={UPLOAD_DOCUMENT_TYPES.map((v) => ({
              value: v,
              label: DOCUMENT_TYPE_META[v].az,
            }))}
            labels={{ ...td.upload }}
            errors={td.errors}
          />
        </Card>
      )}
      <DocumentsList
        records={records}
        labels={{
          empty: td.list.empty,
          emptyDesc: td.list.emptyDesc,
          open: td.list.open,
          download: td.list.download,
          total: td.list.total,
        }}
      />
    </>
  );
}
