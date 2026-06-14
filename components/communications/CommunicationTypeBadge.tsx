import { Badge } from "@/components/ui/Badge";
import { COMMUNICATION_CHANNEL_META, COMMUNICATION_TYPE_META } from "@/lib/constants";

const TONE: Record<string, "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  secondary: "info",
  "text-secondary": "neutral",
};

export function CommunicationChannelBadge({ channel }: { channel: string }) {
  const meta = COMMUNICATION_CHANNEL_META[channel];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? channel}</Badge>;
}

export function CommunicationTypeBadge({ type }: { type: string }) {
  const meta = COMMUNICATION_TYPE_META[type];
  return <Badge tone={TONE[meta?.color ?? ""] ?? "neutral"}>{meta?.az ?? type}</Badge>;
}
