import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listDocuments, type DocumentFilters } from "@/lib/documents";
import { PDF_TYPE_META } from "@/lib/constants";
import { GENERATABLE_PDF_TYPES } from "@/lib/validation/documents";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentsFilterBar } from "@/components/documents/DocumentsFilterBar";
import { DocumentsList } from "@/components/documents/DocumentsList";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("documents.view");
  const t = getDict(user.locale);
  const td = t.documents.list;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filters: DocumentFilters = {
    type: GENERATABLE_PDF_TYPES.includes(s("type") as never) ? s("type") : undefined,
    q: s("q"),
    date: s("date"),
  };
  const records = await listDocuments(user, filters);

  return (
    <>
      <PageHeader title={t.modules.documents.title} description={t.modules.documents.desc} />
      <DocumentsFilterBar
        typeOptions={GENERATABLE_PDF_TYPES.map((v) => ({
          value: v,
          label: PDF_TYPE_META[v].az,
        }))}
        labels={{ ...td.filters }}
      />
      <DocumentsList
        records={records}
        labels={{ empty: td.empty, emptyDesc: td.emptyDesc, open: td.open, total: td.total }}
      />
    </>
  );
}
