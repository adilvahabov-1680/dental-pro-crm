/**
 * Валидация формы пациента (zod). Сообщения — ключи i18n
 * (az-тексты подставляются в форме: t.patients.errors[key]).
 */
import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const patientInputSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstNameRequired").max(100),
    lastName: z.string().trim().min(1, "lastNameRequired").max(100),
    fatherName: optionalTrimmed,
    phone: optionalTrimmed,
    email: optionalTrimmed.refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "invalidEmail",
    ),
    birthDate: optionalTrimmed.refine((v) => {
      if (v === null) return true;
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() > 1900;
    }, "invalidBirthDate"),
    gender: z.enum(["male", "female", ""]).transform((v) => (v ? v : null)),
    address: optionalTrimmed,
    notes: optionalTrimmed,
    allergies: optionalTrimmed,
    chronicDiseases: optionalTrimmed,
    anamnesis: optionalTrimmed,
    source: optionalTrimmed,
    primaryDoctorId: optionalTrimmed,
    status: z.enum(["active", "archived"]).default("active"),
    isChild: z.coerce.boolean().default(false),
    guardianFullName: optionalTrimmed,
    guardianPhone: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    // у ребёнка контакт — через himayəçi; у взрослого телефон обязателен
    if (!data.isChild && !data.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "phoneRequired" });
    }
    if (data.isChild && (!data.guardianFullName || !data.guardianPhone)) {
      ctx.addIssue({ code: "custom", path: ["guardianFullName"], message: "guardianRequired" });
    }
  });

export type PatientInput = z.infer<typeof patientInputSchema>;

export interface PatientFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** zod issues → { field: errorKey } для формы. */
export function issuesToFieldErrors(issues: z.ZodError["issues"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
