import { z } from "zod";
import { ASSIGNABLE_ROLES } from "@/lib/admin";

export interface AdminFormState {
  error?: string;
  saved?: boolean;
  tempPassword?: string;
  email?: string;
  patientsMoved?: number;
  appointmentsMoved?: number;
}

export const roleChangeSchema = z.object({
  userId: z.string().uuid("notFound"),
  roleKey: z.enum(ASSIGNABLE_ROLES, { message: "roleInvalid" }),
});

export const statusToggleSchema = z.object({
  userId: z.string().uuid("notFound"),
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid("notFound"),
  newPassword: z.string().min(6).max(100),
});

export const changeLoginSchema = z.object({
  userId: z.string().uuid("notFound"),
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((v) => /^\S+@\S+\.\S+$/.test(v), "invalidEmail"),
});

export const assignPatientDoctorSchema = z.object({
  patientId: z.string().uuid("patientNotFound"),
  doctorId: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const assignDoctorAssistantSchema = z.object({
  assistantUserId: z.string().uuid("assistantNotFound"),
  doctorUserId: z.string().uuid("doctorNotFound"),
});

export const removeAssistantLinkSchema = z.object({
  assistantUserId: z.string().uuid("assistantNotFound"),
});

export const transferDoctorSchema = z.object({
  fromDoctorUserId: z.string().uuid("doctorNotFound"),
  toDoctorUserId: z.string().uuid("doctorNotFound"),
  transferPatients: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  transferAppointments: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, "nameRequired").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((v) => /^\S+@\S+\.\S+$/.test(v), "invalidEmail"),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  roleKey: z.enum(ASSIGNABLE_ROLES, { message: "roleInvalid" }),
});
