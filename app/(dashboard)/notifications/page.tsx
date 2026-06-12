import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listNotifications, unreadNotificationsCount } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export default async function NotificationsPage() {
  const user = await requirePermission("notifications.view");
  const t = getDict(user.locale);
  const tn = t.notifications;

  const [notifications, unread] = await Promise.all([
    listNotifications(user),
    unreadNotificationsCount(user),
  ]);

  return (
    <>
      <PageHeader
        title={t.modules.notifications.title}
        description={t.modules.notifications.desc}
        actions={
          unread > 0 ? (
            <Badge tone="accent">
              {unread} {tn.unread}
            </Badge>
          ) : undefined
        }
      />
      <NotificationsList
        notifications={notifications}
        unread={unread}
        labels={{
          empty: tn.empty,
          emptyDesc: tn.emptyDesc,
          markRead: tn.markRead,
          markAllRead: tn.markAllRead,
          readBadge: tn.readBadge,
          openInventory: tn.openInventory,
          types: tn.types,
        }}
      />
      {notifications.length > 0 && (
        <p className="mt-3 text-sm tabular-nums text-text-secondary">
          {notifications.length} {tn.total}
        </p>
      )}
    </>
  );
}
