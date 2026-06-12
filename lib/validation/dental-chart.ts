import { z } from "zod";

export const TOOTH_STATUSES = [
  "healthy",
  "needs_treatment",
  "in_treatment",
  "completed",
  "implant",
  "extracted",
  "root_canal",
  "filling",
  "crown",
  "observation",
  "temporary_filling",
  "crown_needed",
  "extraction_planned",
] as const;

export const TOOTH_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const toothUpdateSchema = z.object({
  toothRecordId: z.string().uuid(),
  patientId: z.string().uuid(),
  status: z.enum(TOOTH_STATUSES),
  priority: z.enum(TOOTH_PRIORITIES),
  diagnosis: optionalText,
  doctorNotes: optionalText,
  procedureDone: optionalText, // пишется только в tooth_history
});

export interface ToothFormState {
  ok?: boolean;
  error?: string;
}
