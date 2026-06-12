import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { getPatientForUser } from "@/lib/patients";
import { listPatientPdfRecords } from "@/lib/documents";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentsList } from "@/components/documents/DocumentsList";
import { GenerateDocumentButton } from "@/components/documents/GenerateDocumentButton";

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
  const records = await listPatientPdfRecords(user, patient.id);

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
      <DocumentsList
        records={records}
        labels={{
          empty: td.list.empty,
          emptyDesc: td.list.emptyDesc,
          open: td.list.open,
          total: td.list.total,
        }}
      />
    </>
  );
}
