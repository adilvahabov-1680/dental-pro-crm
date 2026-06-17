import { z } from "zod";

export type ServiceConsumableFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
};

const decimalQty = z
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

export const createConsumableTemplateSchema = z.object({
  serviceId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantity: decimalQty,
  unit: z.string().trim().min(1, "unitRequired").max(50),
  allowOverride: boolField,
  isRequired: boolField,
  note: optionalNote,
});

export const updateConsumableTemplateSchema = z.object({
  templateId: z.string().uuid(),
  quantity: decimalQty,
  unit: z.string().trim().min(1, "unitRequired").max(50),
  allowOverride: boolField,
  isRequired: boolField,
  note: optionalNote,
});

export const deleteConsumableTemplateSchema = z.object({
  templateId: z.string().uuid(),
});
