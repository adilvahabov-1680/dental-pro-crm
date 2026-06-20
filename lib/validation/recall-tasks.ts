import { z } from "zod";

export const RECALL_STATUSES = ["pending", "prepared", "scheduled", "dismissed"] as const;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "generic");

const optionalText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const createRecallTaskSchema = z.object({
  patientId: z.string().uuid("patientRequired"),
  treatmentItemId: optionalUuid,
  serviceId: optionalUuid,
  doctorId: optionalUuid,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDateInvalid"),
  title: z.string().trim().min(1, "titleRequired").max(200),
  note: optionalText,
});

export const prepareRecallMessageSchema = z.object({
  recallTaskId: z.string().uuid("notFound"),
});

export const markRecallScheduledSchema = z.object({
  recallTaskId: z.string().uuid("notFound"),
});

export const dismissRecallSchema = z.object({
  recallTaskId: z.string().uuid("notFound"),
});

export interface RecallFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}
