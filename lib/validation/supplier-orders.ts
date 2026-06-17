import { z } from "zod";

export const addCatalogItemSchema = z.object({
  orderId: z.string().uuid(),
  catalogItemId: z.string().uuid(),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "quantityInvalid")
    .transform((v) => parseFloat(v)),
});

export const updateOrderItemQtySchema = z.object({
  orderItemId: z.string().uuid(),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "quantityInvalid")
    .transform((v) => parseFloat(v)),
});

export const removeOrderItemSchema = z.object({
  orderItemId: z.string().uuid(),
});

export const orderIdSchema = z.object({
  orderId: z.string().uuid(),
});

export const updateOrderNotesSchema = z.object({
  orderId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((v) => v || null),
});

export interface SupplierOrderActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  orderId?: string;
}
