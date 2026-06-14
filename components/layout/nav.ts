/**
 * Описание навигации (server-safe, без JSX).
 * Видимость пунктов: permission `<module>.view`. Admin — клиничный раздел
 * (управление кадрами), виден только пользователям с clinicId (не super_admin).
 */
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import type { SessionUser } from "@/types/auth";

export type NavIconKey =
  | "dashboard"
  | "patients"
  | "appointments"
  | "treatments"
  | "dental_chart"
  | "finance"
  | "inventory"
  | "documents"
  | "notifications"
  | "settings"
  | "admin";

export interface NavItem {
  key: NavIconKey;
  href: string;
  label: string;
}

const NAV: Array<{ key: NavIconKey; href: string; perm: string | null; clinicOnly?: boolean }> = [
  { key: "dashboard", href: "/dashboard", perm: null },
  { key: "patients", href: "/patients", perm: "patients.view" },
  { key: "appointments", href: "/appointments", perm: "appointments.view" },
  { key: "treatments", href: "/treatments", perm: "treatments.view" },
  { key: "dental_chart", href: "/dental-chart", perm: "dental_chart.view" },
  { key: "finance", href: "/finance", perm: "finance.view" },
  { key: "inventory", href: "/inventory", perm: "inventory.view" },
  { key: "documents", href: "/documents", perm: "documents.view" },
  { key: "notifications", href: "/notifications", perm: "notifications.view" },
  { key: "settings", href: "/settings", perm: "settings.view" },
  { key: "admin", href: "/admin", perm: "admin.view", clinicOnly: true },
];

export function buildNav(user: SessionUser): NavItem[] {
  const t = getDict(user.locale);
  return NAV.filter((item) => {
    if (item.clinicOnly && !user.clinicId) return false;
    if (!item.perm) return true;
    return hasPermission(user, item.perm);
  }).map((item) => ({ key: item.key, href: item.href, label: t.nav[item.key] }));
}
