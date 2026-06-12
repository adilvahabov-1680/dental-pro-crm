import { Badge } from "@/components/ui/Badge";
import { INVENTORY_STATUS_META } from "@/lib/constants";
import type { InventoryStatus } from "@/lib/inventory";

const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const meta = INVENTORY_STATUS_META[status];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? status}</Badge>;
}
