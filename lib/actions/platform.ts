"use server";

/**
 * Platform-level server actions — только super_admin.
 * clinicId никогда не берётся из формы для защиты операций super_admin.
 * Все действия над пользователями клиник аудируются.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { listAssignableRoles } from "@/lib/admin";
import { ADMIN_ROLES, countActiveAdmins } from "@/lib/admin";
import {
  createClinicSchema,
  setClinicStatusSchema,
  updateClinicSchema,
  resetPasswordSchema,
  changeLoginSchema,
  createClinicUserSchema,
  type PlatformFormState,
} from "@/lib/validation/platform";

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? "generic";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export async function createClinic(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = createClinicSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { name, phone, email, address, clinicType, adminName, adminEmail, adminPassword } =
    parsed.data;

  // Unique slug
  const baseSlug = slugify(name) || "clinic";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.clinic.findFirst({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existing) return { error: "emailExists" };

  const ownerRole = await prisma.role.findFirst({ where: { clinicId: null, key: "owner" } });
  if (!ownerRole) return { error: "generic" };

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const [clinic, adminUser] = await prisma.$transaction(async (tx) => {
    const c = await tx.clinic.create({
      data: { name, slug, phone, email, address, status: "active", clinicType },
    });
    const u = await tx.user.create({
      data: {
        clinicId: c.id,
        roleId: ownerRole.id,
        email: adminEmail,
        fullName: adminName,
        passwordHash,
        locale: "az",
      },
    });
    return [c, u];
  });

  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "create",
      entityType: "clinic",
      entityId: clinic.id,
      after: { name, adminEmail },
    },
  });

  revalidatePath("/platform/clinics");
  return { saved: true, tempPassword: adminPassword, adminEmail, clinicId: clinic.id };
}

export async function setClinicStatus(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = setClinicStatusSchema.safeParse({
    clinicId: formData.get("clinicId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { clinicId, status } = parsed.data;

  const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null } });
  if (!clinic) return { error: "notFound" };

  await prisma.clinic.update({ where: { id: clinicId }, data: { status } });
  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "update",
      entityType: "clinic",
      entityId: clinicId,
      before: { status: clinic.status },
      after: { status },
    },
  });

  revalidatePath(`/platform/clinics/${clinicId}`);
  revalidatePath("/platform/clinics");
  return { saved: true };
}

/**
 * Редактирование метаданных клиники (сессия 80). slug и logoUrl
 * не редактируются здесь (slug — read-only идентификатор в URL/индексах;
 * загрузка лого — отдельная сессия). id/createdAt/deletedAt не принимаются.
 */
export async function updateClinic(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = updateClinicSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { clinicId, ...data } = parsed.data;

  const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null } });
  if (!clinic) return { error: "notFound" };

  await prisma.clinic.update({ where: { id: clinicId }, data });

  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "update",
      entityType: "clinic",
      entityId: clinicId,
      before: {
        name: clinic.name,
        phone: clinic.phone,
        email: clinic.email,
        address: clinic.address,
        timezone: clinic.timezone,
        currency: clinic.currency,
        defaultLocale: clinic.defaultLocale,
        clinicType: clinic.clinicType,
        status: clinic.status,
        plan: clinic.plan,
      },
      after: data,
    },
  });

  revalidatePath(`/platform/clinics/${clinicId}`);
  revalidatePath("/platform/clinics");
  return { saved: true };
}

export async function platformCreateUser(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = createClinicUserSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { clinicId, fullName, email, phone, roleKey, tempPassword } = parsed.data;

  const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null } });
  if (!clinic) return { error: "notFound" };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: "emailExists" };

  const roles = await listAssignableRoles();
  const role = roles.find((r) => r.key === roleKey);
  if (!role) return { error: "generic" };

  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const created = await prisma.user.create({
    data: { clinicId, roleId: role.id, email, fullName, phone, passwordHash, locale: "az" },
  });

  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      after: { email, fullName, role: roleKey, clinicId },
    },
  });

  revalidatePath(`/platform/clinics/${clinicId}`);
  return { saved: true, tempPassword, adminEmail: email };
}

export async function platformResetPassword(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId, newPassword } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { role: true },
  });
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      after: { passwordReset: true },
    },
  });

  revalidatePath(`/platform/clinics/${target.clinicId}`);
  return { saved: true, tempPassword: newPassword };
}

export async function platformChangeLogin(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const parsed = changeLoginSchema.safeParse({
    userId: formData.get("userId"),
    newEmail: formData.get("newEmail"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { userId, newEmail } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { role: true },
  });
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing && existing.id !== target.id) return { error: "emailExists" };

  const oldEmail = target.email;
  await prisma.user.update({ where: { id: target.id }, data: { email: newEmail } });
  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      before: { email: oldEmail },
      after: { email: newEmail },
    },
  });

  revalidatePath(`/platform/clinics/${target.clinicId}`);
  return { saved: true };
}

export async function platformToggleUserStatus(
  _prev: PlatformFormState | undefined,
  formData: FormData,
): Promise<PlatformFormState> {
  const actor = await requireRole("super_admin");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "generic" };

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { role: true },
  });
  if (!target || target.role.key === "super_admin") return { error: "notFound" };

  const willDeactivate = target.isActive;
  if (willDeactivate && target.clinicId && ADMIN_ROLES.includes(target.role.key as (typeof ADMIN_ROLES)[number])) {
    const remaining = await countActiveAdmins(target.clinicId, target.id);
    if (remaining === 0) return { error: "lastAdmin" };
  }

  await prisma.user.update({ where: { id: target.id }, data: { isActive: !target.isActive } });
  await prisma.auditLog.create({
    data: {
      clinicId: null,
      userId: actor.id,
      action: "update",
      entityType: "user",
      entityId: target.id,
      before: { isActive: target.isActive },
      after: { isActive: !target.isActive },
    },
  });

  revalidatePath(`/platform/clinics/${target.clinicId}`);
  return { saved: true };
}
