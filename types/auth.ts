export type RoleKey =
  | "super_admin"
  | "owner"
  | "admin"
  | "doctor"
  | "reception"
  | "assistant"
  | "accountant";

export type Locale = "az" | "ru" | "en";

/** Пользователь в сессии (JWT-снимок на момент входа). */
export interface SessionUser {
  id: string;
  /** null только у super_admin */
  clinicId: string | null;
  role: RoleKey;
  /** id профиля врача, если role=doctor */
  doctorId: string | null;
  /** id врача, к которому прикреплён ассистент (для scope) */
  assignedDoctorId: string | null;
  fullName: string;
  email: string;
  locale: Locale;
  /**
   * Снимок эффективных прав на момент логина:
   * role_permissions ∪ (user_permissions allowed) − (user_permissions denied).
   * Обновляется при следующем входе.
   */
  permissions: string[];
}

export interface LoginState {
  error?: string;
}
