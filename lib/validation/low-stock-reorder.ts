import { z } from "zod";

/** Single selected row submitted from the /inventory/alerts reorder draft form. */
export const reorderDraftRowSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "quantityInvalid")
    .transform((v) => parseFloat(v))
    .refine((v) => v > 0 && v <= 1_000_000, "quantityInvalid"),
});

export type ReorderDraftRow = z.output<typeof reorderDraftRowSchema>;

export const reorderDraftNoteSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export interface LowStockReorderActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  createdOrders?: Array<{
    orderId: string;
    orderNumber: string;
    supplierName: string;
    isNew: boolean;
  }>;
}
