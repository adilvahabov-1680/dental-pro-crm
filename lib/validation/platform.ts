import { z } from "zod";

export const createClinicSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(200),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "emailInvalid"),
  address: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  clinicType: z.enum(["clinic", "solo_doctor"]).default("clinic"),
  adminName: z.string().trim().min(1, "nameRequired").max(200),
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "emailInvalid")
    .email("emailInvalid")
    .max(255),
  adminPassword: z.string().min(6).max(100),
});

export const setClinicStatusSchema = z.object({
  clinicId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(6).max(100),
});

export const changeLoginSchema = z.object({
  userId: z.string().uuid(),
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "emailInvalid")
    .email("emailInvalid")
    .max(255),
});

export const createClinicUserSchema = z.object({
  clinicId: z.string().uuid(),
  fullName: z.string().trim().min(1, "nameRequired").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "emailInvalid")
    .email("emailInvalid")
    .max(255),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  roleKey: z.enum(["owner", "admin", "doctor", "reception", "assistant", "accountant"]),
  tempPassword: z.string().min(6).max(100),
});

export interface PlatformFormState {
  error?: string;
  saved?: boolean;
  tempPassword?: string;
  adminEmail?: string;
  clinicId?: string;
}
