import { FileX } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentCard } from "@/components/documents/DocumentCard";
import type { DocumentListRow } from "@/lib/documents";

export function DocumentsList({
  records,
  labels,
  canDelete = false,
  deleteLabels,
}: {
  records: DocumentListRow[];
  labels: { empty: string; emptyDesc: string; open: string; download: string; total: string };
  canDelete?: boolean;
  deleteLabels?: { button: string; confirm: string; failed: string };
}) {
  if (records.length === 0) {
    return (
      <Card>
        <EmptyState icon={FileX} title={labels.empty} description={labels.emptyDesc} />
      </Card>
    );
  }
  return (
    <>
      <div className="space-y-2">
        {records.map((r) => (
          <DocumentCard
            key={`${r.kind}-${r.id}`}
            record={r}
            labels={{ open: labels.open, download: labels.download }}
            canDelete={canDelete}
            deleteLabels={deleteLabels}
          />
        ))}
      </div>
      <p className="mt-3 text-sm tabular-nums text-text-secondary">
        {records.length} {labels.total}
      </p>
    </>
  );
}
