import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  contactName: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z.string().trim().email("emailInvalid").optional().or(z.literal("")).transform((v) => v || null),
  address: optionalText,
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const supplierIdSchema = z.object({
  supplierId: z.string().uuid(),
});

export const catalogItemIdSchema = z.object({
  catalogItemId: z.string().uuid(),
});

export interface SupplierFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  supplierId?: string;
}

export interface CatalogImportState {
  error?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
}
