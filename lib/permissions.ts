/**
 * Каталог permissions и ролевые дефолты.
 * ВАЖНО: файл должен оставаться "чистым" (без next/*, без prisma) —
 * его импортируют и seed-скрипт, и edge-код.
 *
 * Формула эффективных прав (см. DATABASE.md §3):
 *   role_permissions ∪ (user_permissions allowed=true) − (user_permissions allowed=false)
 */
import { MODULES, type Module, type PermissionKey, type PersonalPermission } from "@/types/permissions";
import type { RoleKey, SessionUser } from "@/types/auth";

export const PERMISSIONS: Array<{ key: PermissionKey; module: Module; description: string }> =
  MODULES.flatMap((m) => [
    { key: `${m}.view` as PermissionKey, module: m, description: `${m}: baxış` },
    { key: `${m}.manage` as PermissionKey, module: m, description: `${m}: idarəetmə` },
  ]);

const vm = (m: Module): PermissionKey[] => [`${m}.view`, `${m}.manage`];
const v = (m: Module): PermissionKey[] => [`${m}.view`];

/** Все модули клиники, включая клиничный раздел Admin (управление кадрами). */
const ALL_CLINIC: PermissionKey[] = MODULES.flatMap(vm);

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  // super_admin управляет платформой, мед. данные клиник не видит
  super_admin: [...vm("platform"), ...vm("admin")],
  owner: ALL_CLINIC,
  admin: ALL_CLINIC,
  doctor: [
    ...vm("patients"),
    ...vm("appointments"),
    ...vm("treatments"),
    ...vm("dental_chart"),
    ...vm("documents"),
    ...v("finance"),
    ...v("inventory"), // видит остатки материалов; управление складом — inventory.manage
    ...v("notifications"),
    ...v("settings"),
  ],
  reception: [
    ...vm("patients"),
    ...vm("appointments"),
    ...vm("notifications"),
    ...v("finance"),
    ...v("documents"),
  ],
  // дефолт ассистента минимален — расширяется через user_permissions
  assistant: [
    ...v("patients"),
    ...v("appointments"),
    ...v("treatments"),
    ...v("dental_chart"),
  ],
  accountant: [...vm("finance"), ...v("documents")],
};

/** role ∪ allowed − denied. Явный запрет сильнее роли. */
export function resolveEffectivePermissions(
  rolePermissions: string[],
  personal: PersonalPermission[],
): string[] {
  const set = new Set(rolePermissions);
  for (const p of personal) if (p.allowed) set.add(p.key);
  for (const p of personal) if (!p.allowed) set.delete(p.key);
  return [...set];
}

/** Проверка по снимку прав в сессии. Всегда вызывается на сервере. */
export function hasPermission(user: SessionUser, key: PermissionKey | string): boolean {
  return user.permissions.includes(key);
}
