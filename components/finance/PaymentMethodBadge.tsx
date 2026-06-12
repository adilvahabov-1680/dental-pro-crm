import { Banknote, CreditCard, Landmark, CalendarClock, CircleEllipsis } from "lucide-react";
import { PAYMENT_METHOD_META } from "@/lib/constants";

const ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  installment: CalendarClock,
  other: CircleEllipsis,
};

export function PaymentMethodBadge({ method }: { method: string }) {
  const Icon = ICONS[method] ?? CircleEllipsis;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-2.5 py-0.5 text-xs text-text-secondary">
      <Icon className="size-3" /> {PAYMENT_METHOD_META[method]?.az ?? method}
    </span>
  );
}
