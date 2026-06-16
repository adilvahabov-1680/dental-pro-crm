"use server";

/**
 * Server actions модуля Treatment Protocols.
 * Безопасность:
 *  - clinicId всегда из сессии (never trust client)
 *  - protocol/steps/plan/patient/doctor проверяются на принадлежность клинике
 *  - applyProtocol создаёт TreatmentItems от имени аутентифицированного пользователя
 *  - scheduleFollowUp проверяет TreatmentItem по scope пользователя
 */
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantClient, safeUpdateByTenant } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { getTreatmentItemForUser, recalcPlanTotal } from "@/lib/treatments";
import { hasOverlap } from "@/lib/appointments";
import {
  protocolCreateSchema,
  protocolStepSchema,
  applyProtocolSchema,
  scheduleFollowUpSchema,
  type ProtocolFormState,
} from "@/lib/validation/protocols";

// ─────────────────────── Protocol CRUD ───────────────────────

export async function createProtocol(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = protocolCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[i.path[0] as string] = i.message;
    return { fieldErrors: fe };
  }

  const db = tenantClient(user.clinicId);
  try {
    const proto = await db.treatmentProtocol.create({
      data: { name: parsed.data.name, description: parsed.data.description },
    } as never) as unknown as { id: string };
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "treatment_protocol",
        entityId: proto.id,
        after: { name: parsed.data.name },
      },
    } as never);
  } catch (e) {
    console.error("createProtocol failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/protocols");
  return { saved: true };
}

export async function toggleProtocolActive(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "generic" };

  const protocolId = String(formData.get("protocolId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(protocolId)) return { error: "generic" };

  const db = tenantClient(user.clinicId);
  const proto = await db.treatmentProtocol.findFirst({
    where: { id: protocolId, deletedAt: null },
    select: { id: true, isActive: true },
  });
  if (!proto) return { error: "generic" };

  try {
    await safeUpdateByTenant(db.treatmentProtocol as never, "TreatmentProtocol", proto.id, {
      isActive: !proto.isActive,
    });
  } catch (e) {
    console.error("toggleProtocolActive failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/protocols");
  return { saved: true };
}

export async function deleteProtocol(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "generic" };

  const protocolId = String(formData.get("protocolId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(protocolId)) return { error: "generic" };

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.treatmentProtocol as never, "TreatmentProtocol", protocolId, {
      deletedAt: new Date(),
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "delete",
        entityType: "treatment_protocol",
        entityId: protocolId,
      },
    } as never);
  } catch (e) {
    console.error("deleteProtocol failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/protocols");
  return { saved: true };
}

// ─────────────────────── Step CRUD ───────────────────────

export async function addProtocolStep(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = protocolStepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[i.path[0] as string] = i.message;
    return { fieldErrors: fe };
  }

  const db = tenantClient(user.clinicId);

  // protocol belongs to this clinic
  const proto = await db.treatmentProtocol.findFirst({
    where: { id: parsed.data.protocolId, deletedAt: null },
    select: { id: true },
  });
  if (!proto) return { error: "generic" };

  // service belongs to this clinic
  const service = await db.service.findFirst({
    where: { id: parsed.data.serviceId, deletedAt: null },
    select: { id: true },
  });
  if (!service) return { fieldErrors: { serviceId: "serviceRequired" } };

  try {
    await db.treatmentProtocolStep.create({
      data: {
        protocolId: parsed.data.protocolId,
        serviceId: parsed.data.serviceId,
        orderIndex: parsed.data.orderIndex,
        durationMin: parsed.data.durationMin,
        intervalDays: parsed.data.intervalDays,
        notes: parsed.data.notes,
      },
    } as never);
  } catch (e) {
    console.error("addProtocolStep failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/protocols");
  return { saved: true };
}

export async function deleteProtocolStep(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "generic" };

  const stepId = String(formData.get("stepId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(stepId)) return { error: "generic" };

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.treatmentProtocolStep as never, "TreatmentProtocolStep", stepId, {
      deletedAt: new Date(),
    });
  } catch (e) {
    console.error("deleteProtocolStep failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/protocols");
  return { saved: true };
}

// ─────────────────────── Apply Protocol ───────────────────────

/**
 * Apply a treatment protocol to a patient's treatment plan.
 * Creates TreatmentItems for each step in order.
 * Security: all IDs verified against clinic scope.
 */
export async function applyProtocol(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = applyProtocolSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { protocolId, patientId, treatmentPlanId, doctorId: inputDoctorId } = parsed.data;

  // patient must belong to user scope
  const patient = await getPatientForUser(user, patientId);
  if (!patient) return { error: "generic" };

  const db = tenantClient(user.clinicId);

  // protocol must belong to this clinic
  const proto = await db.treatmentProtocol.findFirst({
    where: { id: protocolId, deletedAt: null, isActive: true },
    include: {
      steps: {
        where: { deletedAt: null },
        include: { service: { select: { id: true, prices: { where: { validTo: null }, take: 1, select: { price: true } } } } },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!proto || (proto as { steps: unknown[] }).steps.length === 0) return { error: "generic" };

  // plan must belong to this patient
  const plan = await db.treatmentPlan.findFirst({
    where: { id: treatmentPlanId, patientId: patient.id, deletedAt: null },
    select: { id: true },
  });
  if (!plan) return { error: "generic" };

  // doctor: role overrides form input
  let doctorId = inputDoctorId;
  if (user.role === "doctor" && user.doctorId) doctorId = user.doctorId;
  if (user.role === "assistant") {
    if (!user.assignedDoctorId) return { error: "doctorRequired" };
    doctorId = user.assignedDoctorId;
  }
  const doctor = await db.doctor.findFirst({
    where: { id: doctorId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!doctor) return { error: "doctorRequired" };

  // count existing items in plan to continue orderIndex
  const existingCount = await db.treatmentItem.count({
    where: { treatmentPlanId: plan.id, deletedAt: null },
  });

  const steps = (proto as { steps: Array<{ serviceId: string; orderIndex: number; durationMin: number | null; notes: string | null; service: { id: string; prices: Array<{ price: number }> } }> }).steps;

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const price = step.service.prices[0]?.price ?? 0;
      await db.treatmentItem.create({
        data: {
          patientId: patient.id,
          doctorId,
          serviceId: step.service.id,
          treatmentPlanId: plan.id,
          status: "planned",
          price,
          discount: 0,
          notes: step.notes,
        },
      } as never);
    }

    await recalcPlanTotal(db, plan.id);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "protocol_apply",
        entityId: plan.id,
        after: {
          protocolId,
          patientId: patient.id,
          stepsCount: steps.length,
          existingOffset: existingCount,
        },
      },
    } as never);
  } catch (e) {
    console.error("applyProtocol failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}/treatments`);
  revalidatePath("/treatments");
  return { saved: true };
}

// ─────────────────────── Follow-up Scheduling ───────────────────────

/**
 * Schedule a follow-up appointment for a treatment item.
 * Creates an Appointment and links it to the TreatmentItem via appointmentId.
 * Security: TreatmentItem verified via user scope; doctor verified in clinic.
 */
export async function scheduleFollowUp(
  _prev: ProtocolFormState | undefined,
  formData: FormData,
): Promise<ProtocolFormState> {
  const user = await requirePermission("appointments.manage");
  if (!user.clinicId) return { error: "generic" };

  const parsed = scheduleFollowUpSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[i.path[0] as string] = i.message;
    return { fieldErrors: fe };
  }
  const { treatmentItemId, date, time, durationMin, doctorId: inputDoctorId, notes } = parsed.data;

  // treatment item must be in user scope
  const item = await getTreatmentItemForUser(user, treatmentItemId);
  if (!item) return { error: "notFound" };

  // doctor: role overrides form
  let doctorId = inputDoctorId;
  if (user.role === "doctor" && user.doctorId) doctorId = user.doctorId;
  if (user.role === "assistant") {
    if (!user.assignedDoctorId) return { error: "doctorRequired" };
    doctorId = user.assignedDoctorId;
  }
  const db = tenantClient(user.clinicId);
  const doctor = await db.doctor.findFirst({
    where: { id: doctorId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!doctor) return { error: "doctorRequired" };

  const startsAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(startsAt.getTime())) return { fieldErrors: { date: "invalidDate" } };
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

  if (await hasOverlap(user.clinicId, doctorId, startsAt, endsAt)) {
    return { error: "overlap" };
  }

  try {
    const appt = await db.appointment.create({
      data: {
        patientId: item.patientId,
        doctorId,
        startsAt,
        endsAt,
        notes,
        createdById: user.id,
      },
    } as never) as unknown as { id: string };

    // link appointment back to the treatment item
    await safeUpdateByTenant(db.treatmentItem as never, "TreatmentItem", item.id, {
      appointmentId: appt.id,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "follow_up_appointment",
        entityId: appt.id,
        after: {
          treatmentItemId: item.id,
          patientId: item.patientId,
          doctorId,
          startsAt: startsAt.toISOString(),
        },
      },
    } as never);
  } catch (e) {
    console.error("scheduleFollowUp failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${item.patientId}/treatments`);
  revalidatePath("/appointments");
  return { saved: true };
}
