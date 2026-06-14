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
import type { SessionUser } from "@/types/auth";

export const COMMUNICATION_CHANNELS = ["whatsapp", "sms", "phone", "other"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

/** Каналы, которые относятся к коммуникации с пациентом (не in_app для сотрудников). */
const PATIENT_CHANNELS = ["whatsapp", "sms", "phone", "other"] as const;

/** Статусы приёма, для которых имеет смысл напоминание. */
const REMINDER_STATUSES = ["scheduled", "notified", "confirmed"] as const;

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

export function appointmentReminderMessage(opts: {
  patientName: string;
  clinicName: string;
  date: string;
  time: string;
}): string {
  return (
    `Salam, ${opts.patientName}. ${opts.clinicName} tərəfindən xatırlatma: ` +
    `qəbulunuz ${opts.date} saat ${opts.time}-da planlaşdırılıb. ` +
    `Zəhmət olmasa vaxtında gələsiniz.`
  );
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

export interface ReminderCandidate {
  appointmentId: string;
  patientId: string;
  patientName: string;
  phone: string | null;
  startsAt: Date;
  doctorName: string;
  alreadyPrepared: boolean;
}

/**
 * Кандидаты на напоминание о приёме (Bugünkü xatırlatmalar): приёмы на
 * сегодня/завтра, статус scheduled/notified/confirmed, телефон есть.
 * alreadyPrepared = напоминание этому приёму уже подготовлено сегодня.
 */
export async function listReminderCandidates(user: SessionUser): Promise<ReminderCandidate[]> {
  if (!user.clinicId || !hasPermission(user, "appointments.view")) return [];
  const db = tenantClient(user.clinicId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(todayStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

  const appts = await db.appointment.findMany({
    where: {
      AND: [
        {
          deletedAt: null,
          startsAt: { gte: todayStart, lt: tomorrowEnd },
          status: { in: [...REMINDER_STATUSES] },
        },
        appointmentScopeWhere(user),
      ],
    },
    select: {
      id: true,
      startsAt: true,
      patientId: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  if (appts.length === 0) return [];

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const prepared = await db.notification.findMany({
    where: {
      appointmentId: { in: appts.map((a) => a.id) },
      type: "appointment_reminder",
      createdAt: { gte: todayStart, lt: todayEnd },
    },
    select: { appointmentId: true },
  });
  const preparedSet = new Set(prepared.map((p) => p.appointmentId));

  return appts
    .filter((a) => a.patient.phone)
    .map((a) => ({
      appointmentId: a.id,
      patientId: a.patientId,
      patientName: `${a.patient.lastName} ${a.patient.firstName}`,
      phone: a.patient.phone,
      startsAt: a.startsAt,
      doctorName: a.doctor.user.fullName,
      alreadyPrepared: preparedSet.has(a.id),
    }));
}
