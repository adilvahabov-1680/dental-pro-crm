/**
 * Данные модуля Əlaqə / Communication (сессия 15, v1: manual click-to-chat).
 * Лог коммуникаций хранится в существующей таблице notifications:
 * channel ∈ {whatsapp, sms, phone, other}, status = "prepared" (подготовлено
 * вручную, без отправки через внешний API), type ∈ {appointment_reminder,
 * document_message, payment_reminder, manual_note}.
 * listPatient* — только tenant-фильтр, вызывать ТОЛЬКО после
 * getPatientForUser (patientId уже проверен в scope).
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { appointmentScopeWhere } from "@/lib/appointments";
import { getClinicParams } from "@/lib/settings";
import type { SessionUser } from "@/types/auth";

export const COMMUNICATION_CHANNELS = ["whatsapp", "sms", "phone", "other"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

/** Каналы, которые относятся к коммуникации с пациентом (не in_app для сотрудников). */
const PATIENT_CHANNELS = ["whatsapp", "sms", "phone", "other"] as const;

/**
 * Статусы приёма, попадающие в очередь напоминаний (сессия 42). scheduled/notified
 * — обычный due/prepared поток; confirmed/running_late/reschedule_requested/cancelled
 * — уже есть ответ пациента (или ручной статус), показываются как "responded_*", а не
 * "due". completed/no_show/late_cancelled — вне очереди, напоминание не имеет смысла.
 */
const REMINDER_QUEUE_STATUSES = [
  "scheduled",
  "notified",
  "confirmed",
  "running_late",
  "reschedule_requested",
  "cancelled",
] as const;

/** Эти статусы ещё не получили ответ — кандидат due/prepared (по наличию подготовленного лога). */
const PENDING_RESPONSE_STATUSES = ["scheduled", "notified"] as const;

/**
 * status приёма → reminder-классификация. Появление "responded_*" завязано не на
 * patientResponseStatus, а прямо на Appointment.status — submitPatientResponseAction
 * (сессия 41) пишет одно и то же значение в оба поля, так что отдельное чтение
 * patientResponseStatus здесь избыточно.
 */
const STATUS_TO_REMINDER: Record<string, ReminderStatus> = {
  confirmed: "responded_confirmed",
  running_late: "responded_late",
  reschedule_requested: "responded_reschedule",
  cancelled: "responded_cancelled",
};

/**
 * Нормализация азербайджанского номера телефона для wa.me-ссылки.
 * Принимает "050 123 45 67", "+994501234567", "994501234567" → "994501234567".
 * null = телефон отсутствует или формат не распознан (кнопка отключена).
 */
export function normalizeAzPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("994")) {
    // уже в международном формате
  } else if (digits.startsWith("0")) {
    digits = `994${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `994${digits}`;
  } else {
    return null;
  }
  return /^994\d{9}$/.test(digits) ? digits : null;
}

/** Ссылка click-to-chat (ничего не отправляет автоматически). */
export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * doctorName/responseUrl — опциональны (сессия 41), чтобы существующий
 * unit-level вызов в e2e-communications-check.ts (4 поля) продолжал
 * компилироваться и проходить без изменений.
 */
export function appointmentReminderMessage(opts: {
  patientName: string;
  clinicName: string;
  date: string;
  time: string;
  doctorName?: string;
  responseUrl?: string;
}): string {
  let text =
    `Salam, ${opts.patientName}. ${opts.clinicName} tərəfindən xatırlatma: ` +
    `qəbulunuz ${opts.date} saat ${opts.time}-da planlaşdırılıb` +
    (opts.doctorName ? ` (həkim: ${opts.doctorName})` : "") +
    `. Zəhmət olmasa vaxtında gələsiniz.`;

  if (opts.responseUrl) {
    text +=
      `\n\nZəhmət olmasa cavabınızı bu linkdən seçin:\n${opts.responseUrl}\n\n` +
      `Cavab variantları: gələcəyəm, gecikə bilərəm, vaxtı dəyişmək istəyirəm, ləğv etmək istəyirəm.`;
  }

  return text;
}

export function paymentReminderMessage(opts: {
  patientName: string;
  clinicName: string;
  balance: string;
}): string {
  return (
    `Salam, ${opts.patientName}. ${opts.clinicName} tərəfindən xatırlatma: ` +
    `hesabınızda ${opts.balance} məbləğində ödəniş qalığı var. ` +
    `Münasib vaxtda ödənişi tamamlamağınızı xahiş edirik.`
  );
}

/** Сообщение со ссылкой на выбор предложенного варианта времени (сессия 43). */
export function rescheduleOptionsMessage(opts: {
  patientName: string;
  clinicName: string;
  optionsUrl: string;
}): string {
  return (
    `Hörmətli ${opts.patientName},\n` +
    `${opts.clinicName} qəbul vaxtınızı dəyişmək üçün aşağıdakı linkdən sizə uyğun vaxtı seçin:\n\n` +
    `${opts.optionsUrl}\n\n` +
    `Qeyd: yalnız klinikanın təklif etdiyi vaxtlardan birini seçə bilərsiniz.`
  );
}

export function documentMessage(opts: {
  patientName: string;
  clinicName: string;
  docLabel: string;
}): string {
  return (
    `Salam, ${opts.patientName}. ${opts.clinicName}: "${opts.docLabel}" sənədiniz ` +
    `klinikada hazırdır. Zəhmət olmasa qəbul zamanı əldə edə bilərsiniz.`
  );
}

const communicationListInclude = {
  appointment: { select: { id: true, startsAt: true } },
  document: { select: { id: true, title: true, type: true } },
  invoice: { select: { id: true, number: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.NotificationInclude;

export type CommunicationRow = Prisma.NotificationGetPayload<{
  include: typeof communicationListInclude;
}>;

/** История коммуникаций пациента (последние 50, новые сверху). */
export async function listPatientCommunications(
  user: SessionUser,
  patientId: string,
): Promise<CommunicationRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.notification.findMany({
    where: { patientId, channel: { in: [...PATIENT_CHANNELS] } },
    include: communicationListInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as CommunicationRow[];
}

/**
 * due — внутри окна, напоминание ещё не готовилось.
 * prepared — внутри окна, напоминание уже готовилось (но пациент не ответил).
 * responded_* — пациент ответил по ссылке (или сотрудник вручную поставил тот же статус);
 * WhatsApp-действие для таких приёмов больше не предлагается как основное.
 */
export type ReminderStatus =
  | "due"
  | "prepared"
  | "responded_confirmed"
  | "responded_late"
  | "responded_reschedule"
  | "responded_cancelled";

export interface ReminderCandidate {
  appointmentId: string;
  patientId: string;
  patientName: string;
  phone: string | null;
  startsAt: Date;
  doctorName: string;
  status: ReminderStatus;
  /** true, если для responded_reschedule приёма уже подготовлена reschedule_offer-ссылка (сессия 43). */
  rescheduleOptionsSent: boolean;
}

export interface ReminderQueue {
  candidates: ReminderCandidate[];
  /** часы окна из clinic settings (reminder_hours_before) — для подсказки в панели. */
  reminderHoursBefore: number;
  /** приёмы scheduled/notified, которые наступят позже окна (за пределами due-списка). */
  notDueCount: number;
}

/**
 * Очередь напоминаний о приёме (сессия 42 — v2 на основе reminder_hours_before).
 * Кандидат = приём в окне [сейчас, сейчас + reminderHoursBefore] со статусом из
 * REMINDER_QUEUE_STATUSES, отфильтрованный через appointmentScopeWhere(user).
 * Классификация (due/prepared/responded_*) — см. STATUS_TO_REMINDER и PENDING_RESPONSE_STATUSES.
 * Телефон НЕ фильтрует приём из очереди — отсутствие телефона просто отключает
 * WhatsApp-кнопку (UI), чтобы такие приёмы оставались видимы сотруднику.
 */
export async function listReminderCandidates(user: SessionUser): Promise<ReminderQueue> {
  const empty: ReminderQueue = { candidates: [], reminderHoursBefore: 24, notDueCount: 0 };
  if (!user.clinicId || !hasPermission(user, "appointments.view")) return empty;
  const db = tenantClient(user.clinicId);

  const { reminderHoursBefore } = await getClinicParams(user);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + reminderHoursBefore * 60 * 60 * 1000);
  const scope = appointmentScopeWhere(user);

  const appts = await db.appointment.findMany({
    where: {
      AND: [
        {
          deletedAt: null,
          startsAt: { gte: now, lte: windowEnd },
          status: { in: [...REMINDER_QUEUE_STATUSES] },
        },
        scope,
      ],
    },
    select: {
      id: true,
      status: true,
      startsAt: true,
      patientId: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 50,
  });

  const notDueCount = await db.appointment.count({
    where: {
      AND: [
        {
          deletedAt: null,
          startsAt: { gt: windowEnd },
          status: { in: [...PENDING_RESPONSE_STATUSES] },
        },
        scope,
      ],
    },
  });

  if (appts.length === 0) return { candidates: [], reminderHoursBefore, notDueCount };

  const pendingIds = appts
    .filter((a) => (PENDING_RESPONSE_STATUSES as readonly string[]).includes(a.status))
    .map((a) => a.id);
  const rescheduleIds = appts.filter((a) => a.status === "reschedule_requested").map((a) => a.id);

  const [prepared, rescheduleOffers] = await Promise.all([
    pendingIds.length
      ? db.notification.findMany({
          where: { appointmentId: { in: pendingIds }, type: "appointment_reminder" },
          select: { appointmentId: true },
        })
      : Promise.resolve([]),
    rescheduleIds.length
      ? db.notification.findMany({
          where: { appointmentId: { in: rescheduleIds }, type: "reschedule_offer" },
          select: { appointmentId: true },
        })
      : Promise.resolve([]),
  ]);
  const preparedSet = new Set(prepared.map((p) => p.appointmentId));
  const rescheduleOffersSet = new Set(rescheduleOffers.map((p) => p.appointmentId));

  const candidates = appts.map((a) => ({
    appointmentId: a.id,
    patientId: a.patientId,
    patientName: `${a.patient.lastName} ${a.patient.firstName}`,
    phone: a.patient.phone,
    startsAt: a.startsAt,
    doctorName: a.doctor.user.fullName,
    status: STATUS_TO_REMINDER[a.status] ?? (preparedSet.has(a.id) ? "prepared" : "due"),
    rescheduleOptionsSent: rescheduleOffersSet.has(a.id),
  }));

  return { candidates, reminderHoursBefore, notDueCount };
}
