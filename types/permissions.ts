/** Модули платформы — соответствуют пунктам sidebar и каталогу permissions. */
export const MODULES = [
  "patients",
  "appointments",
  "treatments",
  "dental_chart",
  "finance",
  "inventory",
  "documents",
  "notifications",
  "settings",
  "admin",
] as const;

export type Module = (typeof MODULES)[number];

export type PermissionAction = "view" | "manage";

export type PermissionKey = `${Module}.${PermissionAction}`;

/** Индивидуальное право пользователя (user_permissions). */
export interface PersonalPermission {
  key: string;
  /** false = явный запрет поверх роли */
  allowed: boolean;
}
