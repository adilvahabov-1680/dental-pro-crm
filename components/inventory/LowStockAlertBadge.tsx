import { Badge } from "@/components/ui/Badge";
import type { LowStockAlertStatus } from "@/lib/low-stock";

const TONE: Record<LowStockAlertStatus, "success" | "warning" | "danger" | "info"> = {
  out_of_stock: "danger",
  low_stock: "warning",
  warning: "info",
  ok: "success",
};

export function LowStockAlertBadge({
  status,
  label,
}: {
  status: LowStockAlertStatus;
  label: string;
}) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
