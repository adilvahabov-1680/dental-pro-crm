import { z } from "zod";
import { ASSIGNABLE_ROLES } from "@/lib/admin";

export interface AdminFormState {
  error?: string;
  saved?: boolean;
  tempPassword?: string;
  email?: string;
}

export const roleChangeSchema = z.object({
  userId: z.string().uuid("notFound"),
  roleKey: z.enum(ASSIGNABLE_ROLES, { message: "roleInvalid" }),
});

export const statusToggleSchema = z.object({
  userId: z.string().uuid("notFound"),
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
