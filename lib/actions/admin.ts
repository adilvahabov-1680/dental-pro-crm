"use server";

/**
 * Server actions модуля Admin v1 (admin.manage).
 * Tenant: clinicId всегда из сессии, цель всегда перепроверяется
 * findFirst({ clinicId: user.clinicId }) — формам не доверяем.
 * Self-lockout: нельзя оставить клинику без активного owner/admin,
 * нельзя деактивировать самого себя.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { ADMIN_ROLES, countActiveAdmins, listAssignableRoles } from "@/lib/admin";
import {
  createStaffSchema,
  resetPasswordSchema,
  changeLoginSchema,
  roleChangeSchema,
  statusToggleSchema,
  type AdminFormState,
} from "@/lib/validation/admin";

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? "generic";
}

async function loadTargetUser(clinicId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, clinicId, deletedAt: null },
    include: { role: true },
  });
}

export async function changeStaffRole(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = roleChangeSchema.safeParse({
    userId: formData.get("userId"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId, roleKey } = parsed.data;

  const target = await loadTargetUser(user.clinicId, userId);
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  if (target.role.key === roleKey) return { saved: true };

  // Self-lockout: запрет оставить клинику без активного owner/admin
  const wasAdmin = ADMIN_ROLES.includes(target.role.key as (typeof ADMIN_ROLES)[number]);
  const willBeAdmin = ADMIN_ROLES.includes(roleKey as (typeof ADMIN_ROLES)[number]);
  if (wasAdmin && !willBeAdmin && target.isActive) {
    const remaining = await countActiveAdmins(user.clinicId, target.id);
    if (remaining === 0) return { error: "lastAdmin" };
  }

  const roles = await listAssignableRoles();
  const role = roles.find((r) => r.key === roleKey);
  if (!role) return { error: "roleInvalid" };

  await prisma.user.update({ where: { id: target.id }, data: { roleId: role.id } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      before: { role: target.role.key },
      after: { role: roleKey },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}

export async function toggleStaffStatus(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = statusToggleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId } = parsed.data;

  const target = await loadTargetUser(user.clinicId, userId);
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  if (target.id === user.id) return { error: "selfLockout" };

  const willDeactivate = target.isActive;
  if (willDeactivate && ADMIN_ROLES.includes(target.role.key as (typeof ADMIN_ROLES)[number])) {
    const remaining = await countActiveAdmins(user.clinicId, target.id);
    if (remaining === 0) return { error: "lastAdmin" };
  }

  await prisma.user.update({ where: { id: target.id }, data: { isActive: !target.isActive } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      before: { isActive: target.isActive },
      after: { isActive: !target.isActive },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}

function generateTempPassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

export async function createStaffUser(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = createStaffSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { fullName, email, phone, roleKey } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: "emailExists" };

  const roles = await listAssignableRoles();
  const role = roles.find((r) => r.key === roleKey);
  if (!role) return { error: "roleInvalid" };

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const created = await prisma.user.create({
    data: {
      clinicId: user.clinicId,
      roleId: role.id,
      email,
      phone,
      fullName,
      passwordHash,
      locale: "az",
    },
  });

  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      after: { email, fullName, role: roleKey },
    },
  });

  revalidatePath("/admin");
  return { saved: true, tempPassword, email };
}

export async function resetStaffPassword(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId, newPassword } = parsed.data;

  const target = await loadTargetUser(user.clinicId, userId);
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      after: { passwordReset: true },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}

export async function changeStaffLogin(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = changeLoginSchema.safeParse({
    userId: formData.get("userId"),
    newEmail: formData.get("newEmail"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId, newEmail } = parsed.data;

  const target = await loadTargetUser(user.clinicId, userId);
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing && existing.id !== target.id) return { error: "emailExists" };

  const oldEmail = target.email;
  await prisma.user.update({ where: { id: target.id }, data: { email: newEmail } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      before: { email: oldEmail },
      after: { email: newEmail },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}
