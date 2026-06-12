/** Объединение css-классов без лишних зависимостей. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Деньги хранятся в гяпиках (int) — см. DATABASE.md §0. */
export function formatMoney(qepik: number, currency = "₼"): string {
  return `${(qepik / 100).toLocaleString("az-AZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatDate(date: Date | string, locale = "az-AZ"): string {
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Полный возраст в годах; null, если дата рождения не указана. */
export function calcAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const CHILD_AGE_LIMIT = 18;

/** Детский пациент = возраст < 18 ИЛИ задан опекун (см. DATABASE.md §5). */
export function isChildPatient(birthDate: Date | string | null, guardianId: string | null): boolean {
  const age = calcAge(birthDate);
  if (age !== null && age < CHILD_AGE_LIMIT) return true;
  return guardianId !== null && guardianId !== undefined && guardianId !== "";
}

/** Нормализация телефона: только цифры и ведущий + (без пробелов/скобок/дефисов). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}
