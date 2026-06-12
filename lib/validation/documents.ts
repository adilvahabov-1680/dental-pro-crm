import { z } from "zod";

/** Типы PDF, доступные для генерации в v1. */
export const GENERATABLE_PDF_TYPES = ["extract", "invoice_pdf"] as const;

export const treatmentSummarySchema = z.object({
  patientId: z.string().uuid("patientNotFound"),
});

export const invoicePdfSchema = z.object({
  invoiceId: z.string().uuid("invoiceNotFound"),
});

export interface DocumentFormState {
  error?: string;
}
