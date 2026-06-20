import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecallCreateForm } from "@/components/treatments/RecallCreateForm";

export default async function TreatmentRecallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("treatments.manage");
  const t = getDict(user.locale);
  const tr = t.treatments.recall;
  const { id } = await params;

  const item = await getTreatmentItemForUser(user, id);
  if (!item) notFound();

  const defaultTitle = `${item.service.name} ${tr.defaultTitleSuffix}`;

  return (
    <>
      <PageHeader
        title={tr.formTitle}
        description={`${item.service.name} — ${item.patient.lastName} ${item.patient.firstName}`}
        actions={
          <Link
            href={`/patients/${item.patient.id}/treatments`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {t.treatments.patientBlock.title}
          </Link>
        }
      />

      <div className="max-w-2xl">
        <RecallCreateForm
          patientId={item.patient.id}
          treatmentItemId={item.id}
          serviceId={item.service.id}
          doctorId={item.doctorId}
          defaultTitle={defaultTitle}
          labels={{
            formTitle: tr.formTitle,
            presets: tr.presets,
            dueDateLabel: tr.dueDateLabel,
            titleLabel: tr.titleLabel,
            noteLabel: tr.noteLabel,
            submit: tr.submit,
            saved: tr.saved,
            errors: tr.errors,
          }}
        />
      </div>
    </>
  );
}
