import { Badge } from "@/components/ui/Badge";
import { INVOICE_STATUS_META } from "@/lib/constants";

const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  secondary: "info",
  "text-secondary": "neutral",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const meta = INVOICE_STATUS_META[status];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? status}</Badge>;
}
