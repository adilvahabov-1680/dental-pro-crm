import { z } from "zod";

/** Совпадает с enum ResponseType в schema.prisma. */
export const RESPONSE_TYPES = ["confirm", "running_late", "reschedule_request", "cancel"] as const;

export const submitPatientResponseSchema = z.object({
  token: z.string().trim().min(1, "notFound"),
  responseType: z.enum(RESPONSE_TYPES, { message: "responseRequired" }),
  comment: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export interface PatientResponseFormState {
  error?: string;
  success?: boolean;
  responseType?: string;
}
