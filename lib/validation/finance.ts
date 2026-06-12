import { z } from "zod";

export const PAYMENT_METHODS = ["cash", "card", "transfer", "installment", "other"] as const;

export const INVOICE_STATUSES = ["issued", "partially_paid", "paid", "cancelled"] as const;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** "100" | "25,50" (AZN) → qəpik, строго > 0. */
const moneyAznPositive = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), "amountInvalid")
  .transform((v) => Math.round(Number(v) * 100))
  .refine((v) => v > 0 && v <= 100_000_00, "amountInvalid");

export const invoiceCreateSchema = z.object({
  patientId: z.string().uuid("patientRequired"),
  notes: optionalText,
  // itemIds читаются из formData.getAll — валидируются в action
});

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyAznPositive,
  method: z.enum(PAYMENT_METHODS),
  paidAt: optionalText,
  note: optionalText,
});

export interface FinanceFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}
