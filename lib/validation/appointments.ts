import { z } from "zod";

export const APPOINTMENT_DURATIONS = [15, 20, 30, 45, 60, 90, 120] as const;

/** Статусы приёма — реальный enum из schema (AZ-метки: APPOINTMENT_STATUS_META). */
export const APPOINTMENT_STATUSES = [
  "scheduled",
  "notified",
  "confirmed",
  "arrived",
  "in_progress",
  "running_late",
  "reschedule_requested",
  "completed",
  "no_show",
  "cancelled",
  "late_cancelled",
] as const;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const appointmentCreateSchema = z.object({
  patientId: z.string().uuid("patientRequired"),
  doctorId: z.string().uuid("doctorRequired"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "invalidDate"),
  durationMin: z.coerce
    .number()
    .int()
    .min(5, "invalidDate")
    .max(480, "invalidDate"),
  complaint: optionalText,
  notes: optionalText,
  chair: optionalText,
});

export const appointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(APPOINTMENT_STATUSES),
});

export interface AppointmentFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}
