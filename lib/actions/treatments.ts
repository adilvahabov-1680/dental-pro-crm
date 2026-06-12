"use server";

/**
 * Server actions модуля Müalicə.
 * Form input не считается доверенным: пациент — через getPatientForUser,
 * приём/план/услуга/врач проверяются на принадлежность клинике и пациенту.
 * Создание/смена статуса пишутся в audit_logs; totalPrice плана пересчитывается.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantClient, safeUpdateByTenant } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { getTreatmentItemForUser, recalcPlanTotal } from "@/lib/treatments";
import {
  treatmentItemSchema,
  treatmentStatusSchema,
  treatmentPlanSchema,
  type TreatmentFormState,
} from "@/lib/validation/treatments";
import { issuesToFieldErrors } from "@/lib/validation/patients";

export async function createTreatmentItem(
  _prev: TreatmentFormState | undefined,
  formData: FormData,
): Promise<TreatmentFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = treatmentItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { fieldErrors: { patientId: "patientRequired" } };

  const db = tenantClient(user.clinicId);

  // врач: doctor — всегда сам, assistant — прикреплённый; иначе врач клиники
  let doctorId = input.doctorId;
  if (user.role === "doctor" && user.doctorId) doctorId = user.doctorId;
  if (user.role === "assistant") {
    if (!user.assignedDoctorId) return { error: "doctorRequired" };
    doctorId = user.assignedDoctorId;
  }
  const doctor = await db.doctor.findFirst({
    where: { id: doctorId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!doctor) return { fieldErrors: { doctorId: "doctorRequired" } };

  // услуга клиники
  const service = await db.service.findFirst({
    where: { id: input.serviceId, deletedAt: null },
    select: { id: true },
  });
  if (!service) return { fieldErrors: { serviceId: "serviceRequired" } };

  // план — пациента (если указан)
  if (input.treatmentPlanId) {
    const plan = await db.treatmentPlan.findFirst({
      where: { id: input.treatmentPlanId, patientId: patient.id, deletedAt: null },
      select: { id: true },
    });
    if (!plan) return { error: "planInvalid" };
  }

  // приём — этого пациента (если указан)
  if (input.appointmentId) {
    const appt = await db.appointment.findFirst({
      where: { id: input.appointmentId, patientId: patient.id, deletedAt: null },
      select: { id: true },
    });
    if (!appt) return { error: "appointmentInvalid" };
  }

  // tooth_record пациента — линкуем, если карта инициализирована
  let toothRecordId: string | null = null;
  if (input.toothNumber) {
    const rec = await db.toothRecord.findFirst({
      where: { patientId: patient.id, toothNumber: input.toothNumber, deletedAt: null },
      select: { id: true },
    });
    toothRecordId = rec?.id ?? null;
  }

  // done без даты → сейчас
  const performedAt = input.performedAt
    ? new Date(input.performedAt)
    : input.status === "done"
      ? new Date()
      : null;

  let itemId: string;
  try {
    const created = (await db.treatmentItem.create({
      data: {
        patientId: patient.id,
        doctorId,
        serviceId: service.id,
        treatmentPlanId: input.treatmentPlanId,
        appointmentId: input.appointmentId,
        toothNumber: input.toothNumber,
        toothRecordId,
        status: input.status,
        price: input.price,
        discount: input.discount,
        performedAt,
        notes: input.notes,
      },
    } as never)) as unknown as { id: string };
    itemId = created.id;

    if (input.treatmentPlanId) await recalcPlanTotal(db, input.treatmentPlanId);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "treatment_item",
        entityId: itemId,
        after: {
          patientId: patient.id,
          doctorId,
          serviceId: service.id,
          toothNumber: input.toothNumber,
          status: input.status,
          price: input.price,
        },
      },
    } as never);
  } catch (e) {
    console.error("createTreatmentItem failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}`);
  revalidatePath(`/patients/${patient.id}/treatments`);
  revalidatePath("/treatments");
  redirect(`/patients/${patient.id}/treatments`);
}

export async function updateTreatmentItemStatus(
  _prev: TreatmentFormState | undefined,
  formData: FormData,
): Promise<TreatmentFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = treatmentStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { treatmentItemId, status } = parsed.data;

  const item = await getTreatmentItemForUser(user, treatmentItemId);
  if (!item) return { error: "notFound" };
  if (item.status === status) return {};

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.treatmentItem, "TreatmentItem", item.id, {
      status,
      // done без даты → сейчас
      ...(status === "done" && !item.performedAt ? { performedAt: new Date() } : {}),
    });
    if (item.treatmentPlanId) await recalcPlanTotal(db, item.treatmentPlanId);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "treatment_item",
        entityId: item.id,
        before: { status: item.status },
        after: { status },
      },
    } as never);
  } catch (e) {
    console.error("updateTreatmentItemStatus failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${item.patientId}/treatments`);
  revalidatePath(`/patients/${item.patientId}`);
  revalidatePath("/treatments");
  return {};
}

export async function createTreatmentPlan(
  _prev: TreatmentFormState | undefined,
  formData: FormData,
): Promise<TreatmentFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = treatmentPlanSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };

  const patient = await getPatientForUser(user, parsed.data.patientId);
  if (!patient) return { error: "generic" };

  // план врача: doctor — сам; assistant — прикреплённый; иначе primaryDoctor/первый врач
  const db = tenantClient(user.clinicId);
  let doctorId =
    user.role === "doctor"
      ? user.doctorId
      : user.role === "assistant"
        ? user.assignedDoctorId
        : patient.primaryDoctor?.id ?? null;
  if (!doctorId) {
    const first = await db.doctor.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    doctorId = first?.id ?? null;
  }
  if (!doctorId) return { error: "doctorRequired" };

  try {
    const plan = (await db.treatmentPlan.create({
      data: {
        patientId: patient.id,
        doctorId,
        title: parsed.data.title,
        status: "in_progress",
      },
    } as never)) as unknown as { id: string };
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "treatment_plan",
        entityId: plan.id,
        after: { patientId: patient.id, title: parsed.data.title },
      },
    } as never);
  } catch (e) {
    console.error("createTreatmentPlan failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}/treatments`);
  return {};
}
