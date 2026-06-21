import Link from "next/link";
import { Bell, PackageOpen, CalendarDays, Wallet, CheckCheck, Check, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/lib/notifications";

const TYPE_ICON: Record<string, LucideIcon> = {
  inventory_low_stock: PackageOpen,
  appointment_reminder: CalendarDays,
  followup: CalendarDays,
  repeat_visit_reminder: CalendarDays,
  debt_reminder: Wallet,
  feedback_received: Star,
};

/** Server component: формы — server actions, работают без JS (progressive enhancement). */
export function NotificationsList({
  notifications,
  unread,
  labels,
}: {
  notifications: NotificationRow[];
  unread: number;
  labels: {
    empty: string;
    emptyDesc: string;
    markRead: string;
    markAllRead: string;
    readBadge: string;
    openInventory: string;
    types: Record<string, string>;
  };
}) {
  if (notifications.length === 0) {
    return (
      <Card>
        <EmptyState icon={Bell} title={labels.empty} description={labels.emptyDesc} />
      </Card>
    );
  }

  const fmt = (dt: Date) =>
    `${new Date(dt).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" })} ${new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <>
      {unread > 0 && (
        <form action={markAllNotificationsRead} className="mb-3 flex justify-end">
          <button
            type="submit"
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-3 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <CheckCheck className="size-3.5" /> {labels.markAllRead}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {notifications.map((n) => {
          const isRead = n.status === "read";
          const Icon = TYPE_ICON[n.type] ?? Bell;
          return (
            <li key={n.id} data-notification={n.id}>
              <Card
                className={cn(
                  "flex flex-wrap items-center gap-3 p-3",
                  !isRead && "border-accent/30 bg-accent/5",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    isRead ? "bg-bg-elevated text-text-secondary" : "bg-accent/10 text-accent",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      isRead ? "text-text-secondary" : "font-medium text-text-primary",
                    )}
                  >
                    {n.body}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-secondary/70">
                    {labels.types[n.type] ?? n.type} · {fmt(n.createdAt)}
                  </p>
                </div>
                {n.type === "inventory_low_stock" && (
                  <Link
                    href="/inventory?low=1"
                    className="text-xs text-text-secondary transition-colors hover:text-accent"
                  >
                    {labels.openInventory} →
                  </Link>
                )}
                {isRead ? (
                  <Badge tone="neutral">{labels.readBadge}</Badge>
                ) : (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border border-accent/30 bg-accent/10 px-2.5 text-xs text-accent transition-colors hover:bg-accent/20"
                    >
                      <Check className="size-3.5" /> {labels.markRead}
                    </button>
                  </form>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
