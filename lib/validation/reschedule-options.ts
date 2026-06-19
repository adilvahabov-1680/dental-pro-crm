import { z } from "zod";

/** Не таблица/enum — бизнес-правило сессии 43: 2..3 предложенных вариантов. */
export const RESCHEDULE_OPTIONS_MIN = 2;
export const RESCHEDULE_OPTIONS_MAX = 3;

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "optionsInvalid");
const timeField = z.string().regex(/^\d{2}:\d{2}$/, "optionsInvalid");
const optionalDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "optionsInvalid")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));
const optionalTimeField = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "optionsInvalid")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/**
 * Staff-форма (appointments.manage): варианты 1 и 2 обязательны, 3-й опционален.
 * endTime не вводится — длительность каждого варианта = длительность текущего
 * приёма (см. lib/actions/reschedule-options.ts), это и есть "та же услуга/слот",
 * просто на другое время.
 */
export const proposeRescheduleOptionsSchema = z.object({
  appointmentId: z.string().uuid("notFound"),
  option1Date: dateField,
  option1Time: timeField,
  option2Date: dateField,
  option2Time: timeField,
  option3Date: optionalDateField,
  option3Time: optionalTimeField,
});

export const selectRescheduleOptionSchema = z.object({
  token: z.string().trim().min(1, "notFound"),
  optionId: z.string().trim().min(1, "notFound"),
});

export interface RescheduleOptionsFormState {
  error?: string;
  success?: boolean;
  /** wa.me-ссылка для открытия на клиенте (click-to-chat). */
  waUrl?: string;
}
