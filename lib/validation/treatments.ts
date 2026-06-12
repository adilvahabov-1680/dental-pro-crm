import { z } from "zod";

export const TREATMENT_ITEM_STATUSES = ["planned", "in_progress", "done", "cancelled"] as const;

/** Валидные FDI-номера: взрослые 11–48 + молочные 51–85. */
export function isValidFdi(n: number): boolean {
  const q = Math.floor(n / 10);
  const p = n % 10;
  if (q >= 1 && q <= 4) return p >= 1 && p <= 8;
  if (q >= 5 && q <= 8) return p >= 1 && p <= 5;
  return false;
}

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "generic");

/** "80" | "80,50" | "80.50" (AZN) → qəpik (int). */
const moneyAzn = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), "priceInvalid")
  .transform((v) => Math.round(Number(v) * 100))
  .refine((v) => v >= 0 && v <= 100_000_00, "priceInvalid");

export const treatmentItemSchema = z.object({
  patientId: z.string().uuid("patientRequired"),
  doctorId: z.string().uuid("doctorRequired"),
  serviceId: z.string().uuid("serviceRequired"),
  treatmentPlanId: optionalUuid,
  appointmentId: optionalUuid,
  toothNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && isValidFdi(v)), "toothInvalid"),
  status: z.enum(TREATMENT_ITEM_STATUSES),
  price: moneyAzn,
  discount: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 100) : 0))
    .refine((v) => !Number.isNaN(v) && v >= 0, "priceInvalid"),
  performedAt: optionalText,
  notes: optionalText,
});

export const treatmentStatusSchema = z.object({
  treatmentItemId: z.string().uuid(),
  status: z.enum(TREATMENT_ITEM_STATUSES),
});

export const treatmentPlanSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(1, "titleRequired").max(200),
});

export interface TreatmentFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}
