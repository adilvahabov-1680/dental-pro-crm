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
  assignPatientDoctorSchema,
  assignDoctorAssistantSchema,
  removeAssistantLinkSchema,
  transferDoctorSchema,
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

  // Ensure Doctor/Assistant profile exists when role changes to those roles
  if (roleKey === "doctor") {
    await prisma.doctor.upsert({
      where: { userId: target.id },
      update: {},
      create: { clinicId: user.clinicId, userId: target.id },
    });
  } else if (roleKey === "assistant") {
    await prisma.assistant.upsert({
      where: { userId: target.id },
      update: {},
      create: { clinicId: user.clinicId, userId: target.id },
    });
  }

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

  // Auto-create Doctor/Assistant profile so assignment features work immediately
  if (roleKey === "doctor") {
    await prisma.doctor.upsert({
      where: { userId: created.id },
      update: {},
      create: { clinicId: user.clinicId, userId: created.id },
    });
  } else if (roleKey === "assistant") {
    await prisma.assistant.upsert({
      where: { userId: created.id },
      update: {},
      create: { clinicId: user.clinicId, userId: created.id },
    });
  }

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

// ─── Doctor & Assistant assignment actions ────────────────────────────────────

/**
 * Assign (or clear) a patient's primary doctor.
 * Requires admin.manage. Cross-tenant guard: both patient and doctor must
 * belong to the caller's clinic.
 */
export async function assignPatientDoctor(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = assignPatientDoctorSchema.safeParse({
    patientId: formData.get("patientId"),
    doctorId: formData.get("doctorId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { patientId, doctorId } = parsed.data;

  // Cross-tenant guard: patient must belong to caller's clinic
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId, deletedAt: null },
    select: { id: true, primaryDoctorId: true },
  });
  if (!patient) return { error: "patientNotFound" };

  // If assigning a doctor, verify they belong to same clinic
  if (doctorId) {
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, clinicId: user.clinicId, deletedAt: null },
      select: { id: true },
    });
    if (!doctor) return { error: "crossTenantDoctor" };
  }

  const prev = patient.primaryDoctorId;
  await prisma.patient.update({ where: { id: patientId }, data: { primaryDoctorId: doctorId ?? null } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "patient",
      entityId: patientId,
      before: { primaryDoctorId: prev },
      after: { primaryDoctorId: doctorId ?? null },
    },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  return { saved: true };
}

/**
 * Link an assistant user to a doctor user.
 * Requires admin.manage. Both must be in the caller's clinic.
 */
export async function assignDoctorAssistant(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = assignDoctorAssistantSchema.safeParse({
    assistantUserId: formData.get("assistantUserId"),
    doctorUserId: formData.get("doctorUserId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { assistantUserId, doctorUserId } = parsed.data;

  // Cross-tenant guard: both users must be in caller's clinic
  const [assistantUser, doctorUser] = await Promise.all([
    prisma.user.findFirst({ where: { id: assistantUserId, clinicId: user.clinicId, deletedAt: null }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: doctorUserId, clinicId: user.clinicId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!assistantUser) return { error: "crossTenantAssistant" };
  if (!doctorUser) return { error: "crossTenantDoctor" };

  const [assistantProfile, doctorProfile] = await Promise.all([
    prisma.assistant.findFirst({ where: { userId: assistantUserId, clinicId: user.clinicId, deletedAt: null }, select: { id: true, assignedDoctorId: true } }),
    prisma.doctor.findFirst({ where: { userId: doctorUserId, clinicId: user.clinicId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!assistantProfile) return { error: "assistantNotFound" };
  if (!doctorProfile) return { error: "doctorNotFound" };

  // Idempotent: already linked to same doctor
  if (assistantProfile.assignedDoctorId === doctorProfile.id) return { saved: true };

  const prevDoctorId = assistantProfile.assignedDoctorId;
  await prisma.assistant.update({ where: { id: assistantProfile.id }, data: { assignedDoctorId: doctorProfile.id } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "assistant",
      entityId: assistantProfile.id,
      before: { assignedDoctorId: prevDoctorId },
      after: { assignedDoctorId: doctorProfile.id },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}

/**
 * Bulk-transfer a doctor's patients and/or upcoming appointments to another doctor.
 * Requires admin.manage. Cross-tenant: both doctors must be in the caller's clinic.
 * Known limitation: Assistant.assignedDoctorId is NOT updated — manual reassignment
 * via /admin (Həkim–Assistent section) remains required after transfer.
 */
export async function transferDoctor(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = transferDoctorSchema.safeParse({
    fromDoctorUserId: formData.get("fromDoctorUserId"),
    toDoctorUserId: formData.get("toDoctorUserId"),
    transferPatients: formData.get("transferPatients"),
    transferAppointments: formData.get("transferAppointments"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { fromDoctorUserId, toDoctorUserId, transferPatients, transferAppointments } = parsed.data;

  if (!transferPatients && !transferAppointments) return { error: "nothingSelected" };

  const [fromDoctor, toDoctor] = await Promise.all([
    prisma.doctor.findFirst({
      where: { userId: fromDoctorUserId, clinicId: user.clinicId, deletedAt: null },
      select: { id: true },
    }),
    prisma.doctor.findFirst({
      where: { userId: toDoctorUserId, clinicId: user.clinicId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!fromDoctor) return { error: "doctorNotFound" };
  if (!toDoctor) return { error: "doctorNotFound" };
  if (fromDoctor.id === toDoctor.id) return { error: "sameDoctor" };

  const now = new Date();
  const { patientsMoved, appointmentsMoved } = await prisma.$transaction(async (tx) => {
    let patientsMoved = 0;
    let appointmentsMoved = 0;

    if (transferPatients) {
      const result = await tx.patient.updateMany({
        where: { clinicId: user.clinicId!, primaryDoctorId: fromDoctor.id },
        data: { primaryDoctorId: toDoctor.id },
      });
      patientsMoved = result.count;
    }

    if (transferAppointments) {
      const result = await tx.appointment.updateMany({
        where: {
          clinicId: user.clinicId!,
          doctorId: fromDoctor.id,
          status: { in: ["scheduled", "notified", "confirmed", "reschedule_requested"] },
          startsAt: { gte: now },
          deletedAt: null,
        },
        data: { doctorId: toDoctor.id },
      });
      appointmentsMoved = result.count;
    }

    return { patientsMoved, appointmentsMoved };
  });

  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "transfer",
      entityType: "doctor",
      entityId: fromDoctor.id,
      before: { fromDoctorId: fromDoctor.id },
      after: { toDoctorId: toDoctor.id, patientsMoved, appointmentsMoved },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/patients");
  revalidatePath("/appointments");
  return { saved: true, patientsMoved, appointmentsMoved };
}

/**
 * Remove the link between an assistant and their assigned doctor.
 * Requires admin.manage.
 */
export async function removeAssistantLink(
  _prev: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("admin.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = removeAssistantLinkSchema.safeParse({
    assistantUserId: formData.get("assistantUserId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };
  const { assistantUserId } = parsed.data;

  const assistantProfile = await prisma.assistant.findFirst({
    where: { userId: assistantUserId, clinicId: user.clinicId, deletedAt: null },
    select: { id: true, assignedDoctorId: true },
  });
  if (!assistantProfile) return { error: "assistantNotFound" };

  if (!assistantProfile.assignedDoctorId) return { saved: true }; // already unlinked — idempotent

  const prevDoctorId = assistantProfile.assignedDoctorId;
  await prisma.assistant.update({ where: { id: assistantProfile.id }, data: { assignedDoctorId: null } });
  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "update",
      entityType: "assistant",
      entityId: assistantProfile.id,
      before: { assignedDoctorId: prevDoctorId },
      after: { assignedDoctorId: null },
    },
  });

  revalidatePath("/admin");
  return { saved: true };
}
