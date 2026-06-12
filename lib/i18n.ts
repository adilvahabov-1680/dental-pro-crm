import { az, type Dict } from "@/i18n/az";
import type { Locale } from "@/types/auth";

/**
 * Foundation для i18n: сейчас все локали возвращают AZ.
 * Когда появятся ru.ts / en.ts — добавить их в map, компоненты не меняются.
 */
const dictionaries: Record<Locale, Dict> = {
  az,
  ru: az, // TODO v1.2: ru.ts
  en: az, // TODO v1.2: en.ts
};

export function getDict(locale: Locale = "az"): Dict {
  return dictionaries[locale] ?? az;
}
