import { z } from "zod";

export const protocolCreateSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const protocolStepSchema = z.object({
  protocolId: z.string().uuid(),
  serviceId: z.string().uuid("serviceRequired"),
  orderIndex: z
    .string()
    .transform(Number)
    .refine((v) => Number.isInteger(v) && v >= 0 && v <= 99, "generic"),
  durationMin: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 5 && v <= 480), "generic"),
  intervalDays: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 365), "generic"),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const applyProtocolSchema = z.object({
  protocolId: z.string().uuid("generic"),
  patientId: z.string().uuid("generic"),
  treatmentPlanId: z.string().uuid("generic"),
  doctorId: z.string().uuid("generic"),
});

export const scheduleFollowUpSchema = z.object({
  treatmentItemId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "invalidDate"),
  durationMin: z
    .string()
    .transform(Number)
    .refine((v) => Number.isInteger(v) && v >= 5 && v <= 480, "generic"),
  doctorId: z.string().uuid("generic"),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export interface ProtocolFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}
