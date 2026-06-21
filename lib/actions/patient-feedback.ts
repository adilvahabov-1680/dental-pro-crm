"use server";

/**
 * Staff-side server action модуля Patient Feedback (сессия 45).
 * Принцип, как и в lib/actions/recall-tasks.ts/reschedule-options.ts: action
 * только готовит текст + wa.me-ссылку и пишет лог (status=prepared) — сервер
 * ничего не отправляет, сотрудник сам открывает wa.me-ссылку.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getAppointmentForUser } from "@/lib/appointments";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { getOrCreateFeedbackLink, buildPatientResponseUrl } from "@/lib/patient-response";
import { normalizeAzPhone, buildWhatsAppUrl, feedbackRequestMessage } from "@/lib/communications";
import type { CommunicationFormState } from "@/lib/validation/communications";
import { prepareFeedbackLinkSchema } from "@/lib/validation/patient-feedback";

async function clinicName(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true },
  });
  return clinic.name;
}

/**
 * Готовит ссылку обратной связи для завершённого приёма (status=completed)
 * или завершённой процедуры (status=done) и WhatsApp-сообщение со ссылкой.
 * Без телефона — error "noPhone", ничего не создаётся (как и в остальных
 * prepare*-действиях этого проекта — намеренная v1-упрощение, см. PATIENT_FEEDBACK.md).
 */
export async function prepareFeedbackLinkAction(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("patients.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = prepareFeedbackLinkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "notFound" };
  const input = parsed.data;

  let patient: { id: string; firstName: string; lastName: string; phone: string | null };
  let appointmentId: string | null = null;
  let treatmentItemId: string | null = null;
  let doctorName: string | null = null;

  if (input.appointmentId) {
    const appt = await getAppointmentForUser(user, input.appointmentId);
    if (!appt) return { error: "notFound" };
    if (appt.status !== "completed") return { error: "notCompleted" };
    patient = appt.patient;
    appointmentId = appt.id;
    doctorName = appt.doctor.user.fullName;
  } else if (input.treatmentItemId) {
    const item = await getTreatmentItemForUser(user, input.treatmentItemId);
    if (!item) return { error: "notFound" };
    if (item.status !== "done") return { error: "notCompleted" };
    patient = item.patient;
    treatmentItemId = item.id;
    doctorName = item.doctor.user.fullName;
  } else {
    return { error: "notFound" };
  }

  const phone = normalizeAzPhone(patient.phone);
  if (!phone) return { error: "noPhone" };

  try {
    const db = tenantClient(clinicId);
    const name = await clinicName(clinicId);
    const link = await getOrCreateFeedbackLink(db, {
      patientId: patient.id,
      appointmentId,
      treatmentItemId,
    });
    const feedbackUrl = await buildPatientResponseUrl(link.token);
    const text = feedbackRequestMessage({
      patientName: `${patient.lastName} ${patient.firstName}`,
      clinicName: name,
      feedbackUrl,
      doctorName,
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now = new Date();

    const record = await db.notification.create({
      data: {
        patientId: patient.id,
        appointmentId,
        channel: "whatsapp",
        type: "feedback_received",
        body: text,
        status: "prepared",
        scheduledAt: now,
        sentAt: now,
        createdById: user.id,
      },
    } as never);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "communication",
        entityId: (record as { id: string }).id,
        after: {
          patientId: patient.id,
          appointmentId,
          treatmentItemId,
          channel: "whatsapp",
          type: "feedback_received",
        },
      },
    } as never);

    revalidatePath(`/patients/${patient.id}`);
    revalidatePath("/feedback");
    return { success: true, waUrl };
  } catch (e) {
    console.error("prepareFeedbackLinkAction failed:", e);
    return { error: "generic" };
  }
}
