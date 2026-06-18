import { z } from "zod";

export type ConsumableUsageFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
};

const positiveDecimal = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), "quantityInvalid")
  .transform((v) => Math.round(Number(v) * 1000) / 1000)
  .refine((v) => v > 0 && v <= 1_000_000, "quantityInvalid");

const boolField = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** Single consumable row submitted as part of the checklist. */
export const consumableUsageItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  templateId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  quantity: positiveDecimal,
  unit: z.string().trim().min(1, "unitRequired").max(50),
  wasSkipped: boolField,
  note: optionalNote,
});

export type ConsumableUsageItem = z.output<typeof consumableUsageItemSchema>;

/** Full apply payload — treatmentItemId + array of items. */
export const applyConsumablesSchema = z.object({
  treatmentItemId: z.string().uuid(),
  items: z.array(consumableUsageItemSchema).min(1, "noItems"),
});

export type ApplyConsumablesInput = z.output<typeof applyConsumablesSchema>;

/** Reversal payload — treatmentItemId + mandatory reason. */
export const reverseConsumablesSchema = z.object({
  treatmentItemId: z.string().uuid(),
  reason: z.string().trim().min(3, "reasonTooShort").max(500),
});

export type ReverseConsumablesInput = z.output<typeof reverseConsumablesSchema>;
