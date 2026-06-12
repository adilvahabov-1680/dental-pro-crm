import { Badge } from "@/components/ui/Badge";
import { PDF_TYPE_META, DOCUMENT_TYPE_META } from "@/lib/constants";

const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  secondary: "info",
  "text-secondary": "neutral",
};

/** Метка типа: PdfType (генерируемые PDF) или DocumentType (загруженные файлы). */
export function DocumentTypeBadge({ type }: { type: string }) {
  const meta = PDF_TYPE_META[type] ?? DOCUMENT_TYPE_META[type];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? type}</Badge>;
}
