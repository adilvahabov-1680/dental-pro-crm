import { Badge } from "@/components/ui/Badge";
import { TREATMENT_ITEM_STATUS_META, TREATMENT_PLAN_STATUS_META } from "@/lib/constants";

const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  secondary: "info",
  "text-secondary": "neutral",
};

export function TreatmentStatusBadge({ status }: { status: string }) {
  const meta = TREATMENT_ITEM_STATUS_META[status];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? status}</Badge>;
}

export function TreatmentPlanStatusBadge({ status }: { status: string }) {
  const meta = TREATMENT_PLAN_STATUS_META[status];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? status}</Badge>;
}
