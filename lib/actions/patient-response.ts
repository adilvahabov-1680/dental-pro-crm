"use server";

/**
 * Public (no-login) mutation для /r/[token] — сессия 41.
 * Безопасность: ВСЕ scoping-данные (clinicId/patientId/appointmentId) берутся
 * ТОЛЬКО из записи, найденной по уникальному token. Никакого clinicId/id с
 * клиента не принимается и не используется для поиска. Single-use гарантирует
 * атомарный updateMany(status: "active" -> "used") — конкурентный/повторный
 * сабмит не пройдёт (count = 0).
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { submitPatientResponseSchema, type PatientResponseFormState } from "@/lib/validation/patient-response";

const RESPONSE_TO_STATUS: Record<string, string> = {
  confirm: "confirmed",
  running_late: "running_late",
  reschedule_request: "reschedule_requested",
  cancel: "cancelled",
};

/** Текст записи в "Əlaqə tarixçəsi" пациента (channel=other — самообслуживание через ссылку). */
function patientLogMessage(responseType: string, comment: string | null): string {
  const base: Record<string, string> = {
    confirm: "Pasiyent cavab linki vasitəsilə qəbulu təsdiqlədi (Gələcəyəm).",
    running_late: "Pasiyent cavab linki vasitəsilə gecikə biləcəyini bildirdi (Gecikə bilərəm).",
    reschedule_request: "Pasiyent cavab linki vasitəsilə vaxt dəyişikliyi istədi (Vaxtı dəyişmək istəyirəm).",
    cancel: "Pasiyent cavab linki vasitəsilə qəbulu ləğv etmək istədi (Ləğv etmək istəyirəm).",
  };
  const text = base[responseType] ?? "Pasiyent cavab linki vasitəsilə cavab verdi.";
  return comment ? `${text} Qeyd: ${comment}` : text;
}

/** Текст staff in-app bildirişi (tenant-level, userId=null, type=appointment_reminder). */
function staffNotificationMessage(responseType: string, patientName: string): string {
  const base: Record<string, string> = {
    confirm: `${patientName} qəbulu cavab linki ilə təsdiqlədi.`,
    running_late: `${patientName} qəbula gecikə biləcəyini bildirdi.`,
    reschedule_request: `${patientName} qəbul vaxtının dəyişdirilməsini istəyir.`,
    cancel: `${patientName} qəbulu ləğv etmək istəyir.`,
  };
  return base[responseType] ?? `${patientName} cavab linki ilə cavab verdi.`;
}

export async function submitPatientResponseAction(
  _prev: PatientResponseFormState | undefined,
  formData: FormData,
): Promise<PatientResponseFormState> {
  const parsed = submitPatientResponseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { token, responseType, comment } = parsed.data;

  const link = await prisma.patientResponseLink.findUnique({
    where: { token },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      appointmentId: true,
      status: true,
      expiresAt: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!link || !link.appointmentId) return { error: "notFound" };
  if (link.expiresAt.getTime() < Date.now()) return { error: "expired" };
  if (link.status !== "active") return { error: "alreadyUsed" };

  // Атомарный compare-and-swap: только ОДИН конкурентный запрос пройдёт это условие.
  const claimed = await prisma.patientResponseLink.updateMany({
    where: { id: link.id, status: "active" },
    data: {
      status: "used",
      respondedAt: new Date(),
      responseType,
      responseComment: comment,
      response: { responseType, comment, submittedAt: new Date().toISOString() },
    },
  });
  if (claimed.count === 0) return { error: "alreadyUsed" };

  const db = tenantClient(link.clinicId);
  const newStatus = RESPONSE_TO_STATUS[responseType];
  const patientName = `${link.patient.lastName} ${link.patient.firstName}`;
  const now = new Date();

  try {
    await db.appointment.update({
      where: { id: link.appointmentId },
      // newStatus используется для ОБОИХ полей: PatientResponseStatus
      // переиспользует те же строковые значения, что AppointmentStatus
      // (confirmed/running_late/reschedule_requested/cancelled), а не
      // "сырые" значения ResponseType (confirm/reschedule_request/cancel).
      data: { status: newStatus, patientResponseStatus: newStatus } as never,
    });

    await db.notification.create({
      data: {
        patientId: link.patientId,
        appointmentId: link.appointmentId,
        channel: "other",
        type: "appointment_reminder",
        body: patientLogMessage(responseType, comment),
        status: "prepared",
        scheduledAt: now,
        sentAt: now,
      } as never,
    });

    await db.notification.create({
      data: {
        appointmentId: link.appointmentId,
        channel: "in_app",
        type: "appointment_reminder",
        body: staffNotificationMessage(responseType, patientName),
        status: "pending",
        scheduledAt: now,
      } as never,
    });
  } catch (e) {
    console.error("submitPatientResponseAction failed:", e);
    // Link уже отмечен used — повторный сабмит не повторит запись дважды.
    return { error: "generic" };
  }

  revalidatePath("/appointments");
  revalidatePath(`/patients/${link.patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/notifications");

  return { success: true, responseType };
}
