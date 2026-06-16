"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  Wallet,
  Package,
  FileText,
  Bell,
  Settings,
  ShieldCheck,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { cn } from "@/lib/utils";
import type { NavItem, NavIconKey } from "@/components/layout/nav";
import type { ComponentType, SVGProps } from "react";

const ICONS: Record<NavIconKey, LucideIcon | ComponentType<SVGProps<SVGSVGElement>>> = {
  dashboard: LayoutDashboard,
  patients: Users,
  appointments: CalendarDays,
  treatments: Stethoscope,
  dental_chart: ToothIcon,
  finance: Wallet,
  inventory: Package,
  documents: FileText,
  notifications: Bell,
  settings: Settings,
  admin: ShieldCheck,
  platform: Building2,
};

function NavLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = ICONS[item.key];
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors duration-150",
        compact && "shrink-0 px-3 py-1.5",
        active
          ? "bg-accent/10 font-medium text-accent"
          : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
      )}
    >
      {active && !compact && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      <Icon className="size-[18px]" strokeWidth={1.7} />
      {item.label}
    </Link>
  );
}

/** Десктопный sidebar (фиксированный, ≥lg). */
export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border-subtle bg-bg-surface/60 backdrop-blur-md lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-deep text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.3)]">
          <ToothIcon className="size-6" />
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight text-text-primary">
            Dental <span className="text-accent">Pro</span>
          </p>
          <p className="text-[11px] text-text-secondary">by AV Systems</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {items.map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
      </nav>
      <div className="border-t border-border-subtle px-5 py-3">
        <p className="text-[11px] text-text-secondary">Dental Pro CRM · v0.1</p>
      </div>
    </aside>
  );
}

/** Мобильная навигация (горизонтальные chips, <lg). */
export function MobileNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle bg-bg-surface/60 px-4 py-2 backdrop-blur-md lg:hidden">
      {items.map((item) => (
        <NavLink key={item.key} item={item} compact />
      ))}
    </nav>
  );
}
