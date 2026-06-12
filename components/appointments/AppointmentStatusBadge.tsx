import { Badge } from "@/components/ui/Badge";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";

/** Токен цвета из APPOINTMENT_STATUS_META → tone бейджа. */
const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  secondary: "info",
  "text-secondary": "neutral",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const meta = APPOINTMENT_STATUS_META[status];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? status}</Badge>;
}
