import Link from "next/link";
import { LogOut, Bell } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { getDict } from "@/lib/i18n";
import { hasPermission } from "@/lib/permissions";
import { unreadNotificationsCount } from "@/lib/notifications";
import { getClinicProfile } from "@/lib/settings";
import { getOwnAvatar } from "@/lib/profile";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import type { SessionUser } from "@/types/auth";

export async function Topbar({ user }: { user: SessionUser }) {
  const t = getDict(user.locale);
  const showBell = !!user.clinicId && hasPermission(user, "notifications.view");
  const [unread, clinic, avatar] = await Promise.all([
    showBell ? unreadNotificationsCount(user) : Promise.resolve(0),
    getClinicProfile(user),
    getOwnAvatar(user),
  ]);
  const avatarSrc = avatar?.avatarUrl
    ? `/api/user-avatar/${user.id}?v=${avatar.updatedAt.getTime()}`
    : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border-subtle bg-bg-base/80 px-4 backdrop-blur-md sm:px-6">
      {clinic && (
        <div className="flex min-w-0 items-center gap-2">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/clinic-logo/${clinic.id}?v=${clinic.updatedAt.getTime()}`}
              alt={clinic.name}
              className="size-8 shrink-0 rounded-[8px] object-cover"
            />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent/10 text-xs font-semibold text-accent">
              {clinic.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden truncate text-sm font-medium text-text-primary sm:inline">
            {clinic.name}
          </span>
        </div>
      )}
      {!!user.clinicId && (
        <GlobalSearch
          labels={{
            placeholder: t.globalSearch.placeholder,
            minLength: t.globalSearch.minLength,
            loading: t.globalSearch.loading,
            empty: t.globalSearch.empty,
            groups: t.globalSearch.groups,
          }}
        />
      )}

      <div className="ml-auto flex items-center gap-3">
        {showBell && (
          <Link
            href="/notifications"
            title={t.nav.notifications}
            data-testid="topbar-bell"
            className="relative flex size-9 items-center justify-center rounded-[10px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <Bell className="size-[18px]" strokeWidth={1.7} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-bg-base">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        )}
        <div className="text-right">
          <p className="text-sm font-medium leading-tight text-text-primary">{user.fullName}</p>
          <p className="text-[11px] leading-tight text-accent">{t.roles[user.role]}</p>
        </div>
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={user.fullName}
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent/30 to-accent-deep/30 text-sm font-semibold text-accent">
            {user.fullName.charAt(0)}
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            title={t.auth.logout}
            className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-danger"
          >
            <LogOut className="size-[18px]" strokeWidth={1.7} />
          </button>
        </form>
      </div>
    </header>
  );
}
