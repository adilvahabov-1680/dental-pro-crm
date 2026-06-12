import { z } from "zod";

/** Дни недели в порядке отображения; ключи хранятся в setting working_hours. */
export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface DayHours {
  from: string; // "09:00"
  to: string; // "18:00"
}
/** null = клиника в этот день закрыта. */
export type WorkingHours = Record<WeekDay, DayHours | null>;

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** "80" | "80,50" | "80.50" (AZN) → qəpik; пустая строка → null. */
const optionalMoney = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 100) : null))
  .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v <= 100_000_00), "priceInvalid");

export const clinicProfileSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  phone: optionalText,
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), "invalidEmail"),
  address: optionalText,
});

const intInRange = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isInteger(Number(v)), "numberInvalid")
    .transform(Number)
    .refine((v) => v >= min && v <= max, "numberInvalid");

export const clinicParamsSchema = z.object({
  defaultAppointmentMinutes: intInRange(5, 480),
  reminderHoursBefore: intInRange(1, 168),
  // checkbox: присутствует в FormData только когда включён
  doctorSeesAllPatients: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Часы одного дня из формы: enabled_<day> + from_<day>/to_<day>. */
export function parseWorkingHoursForm(formData: FormData):
  | { ok: true; value: WorkingHours }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const value = {} as WorkingHours;
  for (const day of WEEK_DAYS) {
    const enabled = formData.get(`enabled_${day}`) === "on";
    if (!enabled) {
      value[day] = null;
      continue;
    }
    const from = String(formData.get(`from_${day}`) ?? "").trim();
    const to = String(formData.get(`to_${day}`) ?? "").trim();
    if (!TIME_RE.test(from) || !TIME_RE.test(to)) {
      fieldErrors[day] = "timeInvalid";
    } else if (from >= to) {
      fieldErrors[day] = "timeRange";
    } else {
      value[day] = { from, to };
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value };
}

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  categoryId: optionalText,
  durationMin: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 5 && v <= 480), "numberInvalid"),
  isChildService: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  price: optionalMoney,
  childPrice: optionalMoney,
});

export const servicePriceSchema = z.object({
  serviceId: z.string().uuid(),
  price: z
    .string()
    .trim()
    .min(1, "priceRequired")
    .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
    .refine((v) => !Number.isNaN(v) && v >= 0 && v <= 100_000_00, "priceInvalid"),
  childPrice: optionalMoney,
});

export const serviceToggleSchema = z.object({
  serviceId: z.string().uuid(),
});

export interface SettingsFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}
