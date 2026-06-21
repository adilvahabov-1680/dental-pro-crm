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
import { formatDate } from "@/lib/utils";
import { parseRescheduleOptions, parsePendingFeedbackTreatmentItemId } from "@/lib/patient-response";
import { submitPatientResponseSchema, type PatientResponseFormState } from "@/lib/validation/patient-response";
import { selectRescheduleOptionSchema } from "@/lib/validation/reschedule-options";
import { submitFeedbackSchema } from "@/lib/validation/patient-feedback";

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

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d)} ${d.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Public (no-login) выбор одного из предложенных клиникой вариантов времени
 * (сессия 43). Безопасность — тот же принцип, что и в submitPatientResponseAction:
 * все scoping-данные берутся ТОЛЬКО из записи, найденной по token; single-use
 * через атомарный updateMany(status: active -> used).
 */
export async function selectRescheduleOptionAction(
  _prev: PatientResponseFormState | undefined,
  formData: FormData,
): Promise<PatientResponseFormState> {
  const parsed = selectRescheduleOptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { token, optionId } = parsed.data;

  const link = await prisma.patientResponseLink.findUnique({
    where: { token },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      appointmentId: true,
      purpose: true,
      status: true,
      expiresAt: true,
      response: true,
      patient: { select: { firstName: true, lastName: true } },
      appointment: { select: { startsAt: true, endsAt: true } },
    },
  });
  if (!link || !link.appointmentId || !link.appointment || link.purpose !== "reschedule_offer") {
    return { error: "notFound" };
  }
  if (link.expiresAt.getTime() < Date.now()) return { error: "expired" };
  if (link.status !== "active") return { error: "alreadyUsed" };

  const options = parseRescheduleOptions(link.response);
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) return { error: "notFound" };

  const previousStartsAt = link.appointment.startsAt.toISOString();
  const previousEndsAt = link.appointment.endsAt.toISOString();

  // Атомарный compare-and-swap: только ОДИН конкурентный запрос пройдёт это условие.
  const claimed = await prisma.patientResponseLink.updateMany({
    where: { id: link.id, status: "active" },
    data: {
      status: "used",
      respondedAt: new Date(),
      response: {
        kind: "selected",
        selectedOptionId: optionId,
        previousStartsAt,
        previousEndsAt,
        newStartsAt: chosen.startsAt,
        newEndsAt: chosen.endsAt,
      },
    },
  });
  if (claimed.count === 0) return { error: "alreadyUsed" };

  const db = tenantClient(link.clinicId);
  const patientName = `${link.patient.lastName} ${link.patient.firstName}`;
  const now = new Date();

  try {
    // appointmentId принадлежит этой клинике по построению (создан только через
    // tenantClient(link.clinicId) в createOrReplaceRescheduleOptionsLink) — тот же
    // принцип точечного update по id, что и выше в submitPatientResponseAction.
    await db.appointment.update({
      where: { id: link.appointmentId },
      data: {
        startsAt: new Date(chosen.startsAt),
        endsAt: new Date(chosen.endsAt),
        status: "scheduled",
        patientResponseStatus: "pending",
      } as never,
    });

    await db.notification.create({
      data: {
        patientId: link.patientId,
        appointmentId: link.appointmentId,
        channel: "other",
        type: "reschedule_offer",
        body: `Pasiyent cavab linki vasitəsilə yeni qəbul vaxtını seçdi: ${fmtDateTime(previousStartsAt)} → ${fmtDateTime(chosen.startsAt)}.`,
        status: "prepared",
        scheduledAt: now,
        sentAt: now,
      } as never,
    });

    await db.notification.create({
      data: {
        appointmentId: link.appointmentId,
        channel: "in_app",
        type: "reschedule_offer",
        body: `${patientName} yeni qəbul vaxtını seçdi: ${fmtDateTime(chosen.startsAt)}.`,
        status: "pending",
        scheduledAt: now,
      } as never,
    });
  } catch (e) {
    console.error("selectRescheduleOptionAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/appointments");
  revalidatePath(`/patients/${link.patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/notifications");

  return { success: true };
}

/**
 * Public (no-login) сабмит отзыва (сессия 45). Безопасность — тот же
 * принцип: scoping только из записи по token; single-use через атомарный
 * updateMany(status: active -> used). rating/comment валидируются схемой
 * (1–5, comment ≤1000 символов) — любая ошибка схемы сводится к generic,
 * как и в submitPatientResponseAction/selectRescheduleOptionAction.
 */
export async function submitFeedbackAction(
  _prev: PatientResponseFormState | undefined,
  formData: FormData,
): Promise<PatientResponseFormState> {
  const parsed = submitFeedbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { token, rating, comment } = parsed.data;

  const link = await prisma.patientResponseLink.findUnique({
    where: { token },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      appointmentId: true,
      purpose: true,
      status: true,
      expiresAt: true,
      response: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!link || link.purpose !== "feedback") return { error: "notFound" };
  if (link.expiresAt.getTime() < Date.now()) return { error: "expired" };
  if (link.status !== "active") return { error: "alreadyUsed" };

  const treatmentItemId = parsePendingFeedbackTreatmentItemId(link.response);

  // Атомарный compare-and-swap: только ОДИН конкурентный запрос пройдёт это условие.
  const claimed = await prisma.patientResponseLink.updateMany({
    where: { id: link.id, status: "active" },
    data: {
      status: "used",
      respondedAt: new Date(),
      response: { kind: "feedback_submitted", rating, comment, submittedAt: new Date().toISOString() },
    },
  });
  if (claimed.count === 0) return { error: "alreadyUsed" };

  const db = tenantClient(link.clinicId);
  const patientName = `${link.patient.lastName} ${link.patient.firstName}`;
  const now = new Date();

  try {
    await db.patientFeedback.create({
      data: {
        patientId: link.patientId,
        appointmentId: link.appointmentId,
        treatmentItemId,
        responseLinkId: link.id,
        rating,
        comment,
        submittedAt: now,
      },
    } as never);

    await db.notification.create({
      data: {
        patientId: link.patientId,
        appointmentId: link.appointmentId,
        channel: "other",
        type: "feedback_received",
        body: `Pasiyent rəy linki vasitəsilə qiymətləndirmə bildirdi: ${rating}/5${comment ? ` — "${comment}"` : ""}.`,
        status: "prepared",
        scheduledAt: now,
        sentAt: now,
      } as never,
    });

    await db.notification.create({
      data: {
        appointmentId: link.appointmentId,
        channel: "in_app",
        type: "feedback_received",
        body: `${patientName} ${rating}/5 qiymət bildirdi.`,
        status: "pending",
        scheduledAt: now,
      } as never,
    });
  } catch (e) {
    console.error("submitFeedbackAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${link.patientId}`);
  revalidatePath("/feedback");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");

  return { success: true };
}
