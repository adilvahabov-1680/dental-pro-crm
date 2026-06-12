import Link from "next/link";
import { LogOut, Search, Bell } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { getDict } from "@/lib/i18n";
import { hasPermission } from "@/lib/permissions";
import { unreadNotificationsCount } from "@/lib/notifications";
import type { SessionUser } from "@/types/auth";

export async function Topbar({ user }: { user: SessionUser }) {
  const t = getDict(user.locale);
  const showBell = !!user.clinicId && hasPermission(user, "notifications.view");
  const unread = showBell ? await unreadNotificationsCount(user) : 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border-subtle bg-bg-base/80 px-4 backdrop-blur-md sm:px-6">
      {/* Глобальный поиск — заглушка до модуля пациентов */}
      <div className="relative hidden max-w-sm flex-1 items-center md:flex">
        <Search className="pointer-events-none absolute left-3 size-4 text-text-secondary" />
        <input
          disabled
          placeholder={t.common.search}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-surface/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none disabled:cursor-not-allowed"
        />
      </div>

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
        <div className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-accent/30 to-accent-deep/30 text-sm font-semibold text-accent">
          {user.fullName.charAt(0)}
        </div>
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
