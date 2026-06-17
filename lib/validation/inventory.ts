import { z } from "zod";

/** Типы движений в формах v1 (addInventoryMovement action). */
export const MOVEMENT_FORM_TYPES = ["in_stock", "out_stock", "write_off"] as const;

/** Типы ручных корректировок склада (сессия 31). */
export const CORRECTION_TYPES = ["adjustment", "adjustment_out", "write_off"] as const;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** "1" | "0,2" | "12.5" → нормализованная строка для Prisma Decimal (≥0, 3 знака). */
const decimalQty = (min: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => v !== "" && !Number.isNaN(Number(v)), "quantityInvalid")
    .transform((v) => Math.round(Number(v) * 1000) / 1000)
    .refine((v) => v >= min && v <= 1_000_000, "quantityInvalid");

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 100) : null))
  .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), "quantityInvalid");

/** "50" | "1,5" | "" → number > 0; empty → 1 (default). */
const decimalFactor = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v.replace(",", ".") : "1"))
  .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "factorInvalid")
  .transform((v) => Math.round(Number(v) * 10000) / 10000);

/** "2" | "" | undefined → number > 0 or null. */
const optionalFactor = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v.replace(",", ".") : null))
  .refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) > 0), "factorInvalid")
  .transform((v) => (v !== null ? Math.round(Number(v) * 10000) / 10000 : null));

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  categoryId: optionalText,
  unit: z.string().trim().min(1, "unitRequired").max(50),
  purchaseUnit: optionalText,
  purchaseToBaseFactor: decimalFactor,
  doseToBaseFactor: optionalFactor,
  initialQuantity: decimalQty(0),
  minQuantity: decimalQty(0),
  purchasePrice: optionalMoney,
  supplierName: optionalText,
  expiresAt: optionalText,
});

export const movementSchema = z.object({
  inventoryItemId: z.string().uuid(),
  type: z.enum(MOVEMENT_FORM_TYPES),
  quantity: decimalQty(0.001),
  reason: optionalText,
});

export const stockCorrectionSchema = z.object({
  itemId: z.string().uuid(),
  type: z.enum(CORRECTION_TYPES),
  quantity: decimalQty(0.001),
  reason: z.string().trim().min(3, "reasonTooShort").max(500),
  note: optionalText,
});

export const treatmentMaterialSchema = z.object({
  treatmentItemId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantity: decimalQty(0.001),
});

export interface InventoryFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}
