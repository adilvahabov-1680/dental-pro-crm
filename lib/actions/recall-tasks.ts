"use server";

/**
 * Server actions модуля Recall / Kontrol xatırlatmaları (сессия 44).
 * RecallTask НЕ приём — отдельная задача-напоминание. Никакого автоматического
 * создания приёма и никакой автоматической отправки: prepareRecallMessageAction
 * только готовит текст + wa.me-ссылку (как и lib/actions/communications.ts) —
 * сотрудник сам открывает ссылку и отправляет сообщение вручную.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient, safeUpdateByTenant } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { getRecallTaskForUser } from "@/lib/recall-tasks";
import { normalizeAzPhone, buildWhatsAppUrl, recallMessage } from "@/lib/communications";
import type { CommunicationFormState } from "@/lib/validation/communications";
import {
  createRecallTaskSchema,
  prepareRecallMessageSchema,
  markRecallScheduledSchema,
  dismissRecallSchema,
  type RecallFormState,
} from "@/lib/validation/recall-tasks";
import { issuesToFieldErrors } from "@/lib/validation/patients";

async function clinicName(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true },
  });
  return clinic.name;
}

/**
 * Создаёт recall-задачу. Не двигает/создаёт приём, не отправляет сообщение.
 * dueDate должен быть строго в будущем (день, без времени). Дубликат
 * (тот же patientId+treatmentItemId+dueDate) отклоняется, если treatmentItemId указан.
 */
export async function createRecallTaskAction(
  _prev: RecallFormState | undefined,
  formData: FormData,
): Promise<RecallFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = createRecallTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { fieldErrors: { patientId: "patientRequired" } };

  const db = tenantClient(clinicId);

  let treatmentItemId: string | null = null;
  if (input.treatmentItemId) {
    const item = await getTreatmentItemForUser(user, input.treatmentItemId);
    if (!item || item.patient.id !== patient.id) return { error: "treatmentInvalid" };
    treatmentItemId = item.id;
  }

  if (input.serviceId) {
    const service = await db.service.findFirst({
      where: { id: input.serviceId, deletedAt: null },
      select: { id: true },
    });
    if (!service) return { error: "generic" };
  }

  if (input.doctorId) {
    const doctor = await db.doctor.findFirst({
      where: { id: input.doctorId, deletedAt: null },
      select: { id: true },
    });
    if (!doctor) return { error: "generic" };
  }

  const dueDate = new Date(`${input.dueDate}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return { fieldErrors: { dueDate: "dueDateInvalid" } };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dueDate.getTime() <= today.getTime()) return { fieldErrors: { dueDate: "dueDateFuture" } };

  if (treatmentItemId) {
    const duplicate = await db.recallTask.findFirst({
      where: { patientId: patient.id, treatmentItemId, dueDate, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) return { error: "duplicate" };
  }

  let recallId: string;
  try {
    const created = (await db.recallTask.create({
      data: {
        patientId: patient.id,
        doctorId: input.doctorId,
        treatmentItemId,
        serviceId: input.serviceId,
        dueDate,
        title: input.title,
        note: input.note,
        status: "pending",
        createdById: user.id,
      },
    } as never)) as unknown as { id: string };
    recallId = created.id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "recall_task",
        entityId: recallId,
        after: {
          patientId: patient.id,
          treatmentItemId,
          dueDate: dueDate.toISOString(),
          title: input.title,
        },
      },
    } as never);
  } catch (e) {
    console.error("createRecallTaskAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}/treatments`);
  revalidatePath(`/patients/${patient.id}`);
  revalidatePath("/recalls");
  revalidatePath("/dashboard");
  return { success: true };
}

/** WhatsApp kontrol mesajı — готовит текст + wa.me-ссылку, пишет лог, status=prepared. */
export async function prepareRecallMessageAction(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = prepareRecallMessageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "notFound" };

  const recall = await getRecallTaskForUser(user, parsed.data.recallTaskId);
  if (!recall) return { error: "notFound" };

  const phone = normalizeAzPhone(recall.patient.phone);
  if (!phone) return { error: "noPhone" };

  try {
    const db = tenantClient(clinicId);
    const name = await clinicName(clinicId);
    const text = recallMessage({
      patientName: `${recall.patient.lastName} ${recall.patient.firstName}`,
      clinicName: name,
      doctorName: recall.doctor?.user.fullName,
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now = new Date();

    const record = await db.notification.create({
      data: {
        patientId: recall.patient.id,
        channel: "whatsapp",
        type: "repeat_visit_reminder",
        body: text,
        status: "prepared",
        scheduledAt: now,
        sentAt: now,
        createdById: user.id,
      },
    } as never);

    await safeUpdateByTenant(db.recallTask, "RecallTask", recall.id, {
      status: "prepared",
      preparedAt: now,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "communication",
        entityId: (record as { id: string }).id,
        after: {
          patientId: recall.patient.id,
          recallTaskId: recall.id,
          channel: "whatsapp",
          type: "repeat_visit_reminder",
        },
      },
    } as never);

    revalidatePath(`/patients/${recall.patient.id}`);
    revalidatePath("/recalls");
    revalidatePath("/dashboard");
    return { success: true, waUrl };
  } catch (e) {
    console.error("prepareRecallMessageAction failed:", e);
    return { error: "generic" };
  }
}

/** Помечает recall как scheduled — appointment не создаётся (создаётся вручную отдельно). */
export async function markRecallScheduledAction(
  _prev: RecallFormState | undefined,
  formData: FormData,
): Promise<RecallFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = markRecallScheduledSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "notFound" };

  const recall = await getRecallTaskForUser(user, parsed.data.recallTaskId);
  if (!recall) return { error: "notFound" };

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.recallTask, "RecallTask", recall.id, { status: "scheduled" });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "recall_task",
        entityId: recall.id,
        before: { status: recall.status },
        after: { status: "scheduled" },
      },
    } as never);
  } catch (e) {
    console.error("markRecallScheduledAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${recall.patient.id}`);
  revalidatePath("/recalls");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Закрывает recall без действия — не появляется больше в активной очереди. */
export async function dismissRecallAction(
  _prev: RecallFormState | undefined,
  formData: FormData,
): Promise<RecallFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = dismissRecallSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "notFound" };

  const recall = await getRecallTaskForUser(user, parsed.data.recallTaskId);
  if (!recall) return { error: "notFound" };

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.recallTask, "RecallTask", recall.id, { status: "dismissed" });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "recall_task",
        entityId: recall.id,
        before: { status: recall.status },
        after: { status: "dismissed" },
      },
    } as never);
  } catch (e) {
    console.error("dismissRecallAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${recall.patient.id}`);
  revalidatePath("/recalls");
  revalidatePath("/dashboard");
  return { success: true };
}
