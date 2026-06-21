/**
 * Patient Response Link foundation (сессия 41).
 * Public, no-login flow: пациент открывает /r/[token] и выбирает ответ на
 * напоминание о приёме. Никакой WhatsApp API, никакой автоматической отправки —
 * только генерация ссылки (staff-side) и приём ответа (public-side).
 * schema НЕ менялась — PatientResponseLink/ResponseType/LinkStatus/LinkPurpose
 * уже существовали (session pre-41), просто не использовались нигде в коде.
 */
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { TenantClient } from "@/lib/tenant";

export const RESPONSE_LINK_TTL_HOURS = 48;

/** Допустимый формат токена в URL (защита от мусорных запросов до похода в БД). */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,64}$/;

/** Криптослучайный, непредсказуемый, URL-safe токен (256 бит энтропии). */
export function generateResponseToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Базовый URL приложения: NEXT_PUBLIC_APP_URL, иначе — заголовки текущего запроса. */
async function getAppBaseUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function buildPatientResponseUrl(token: string): Promise<string> {
  const base = await getAppBaseUrl();
  return `${base}/r/${token}`;
}

/** Один предложенный клиникой вариант времени (сессия 43). */
export interface RescheduleOption {
  /** стабильный в рамках ссылки id ("1"/"2"/"3"), а не appointment/db id. */
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

function isRescheduleOption(v: unknown): v is RescheduleOption {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).id === "string" &&
    typeof (v as Record<string, unknown>).startsAt === "string" &&
    typeof (v as Record<string, unknown>).endsAt === "string"
  );
}

/** Защитный парсинг response-json ссылки purpose=reschedule_offer (см. createOrReplaceRescheduleOptionsLink). */
export function parseRescheduleOptions(response: unknown): RescheduleOption[] {
  if (!response || typeof response !== "object") return [];
  const obj = response as Record<string, unknown>;
  if (obj.kind !== "options" || !Array.isArray(obj.options)) return [];
  return obj.options.filter(isRescheduleOption);
}

/**
 * Активная ссылка-ответ для приёма: переиспользует pending-ссылку (не истёкшую),
 * иначе создаёт новую. Один активный токен на appointment — без дублирования.
 * db — tenantClient(clinicId), clinicId инжектится автоматически на create.
 */
export async function getOrCreateAppointmentResponseLink(
  db: TenantClient,
  params: { patientId: string; appointmentId: string },
): Promise<{ id: string; token: string }> {
  const existing = await db.patientResponseLink.findFirst({
    where: {
      appointmentId: params.appointmentId,
      purpose: "confirm_appointment",
      status: "active",
      expiresAt: { gt: new Date() },
    },
    select: { id: true, token: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const token = generateResponseToken();
  const expiresAt = new Date(Date.now() + RESPONSE_LINK_TTL_HOURS * 60 * 60 * 1000);
  return db.patientResponseLink.create({
    data: {
      patientId: params.patientId,
      appointmentId: params.appointmentId,
      token,
      purpose: "confirm_appointment",
      status: "active",
      expiresAt,
    } as never,
    select: { id: true, token: true },
  });
}

/**
 * Ссылка с предложенными вариантами времени (сессия 43). В отличие от
 * getOrCreateAppointmentResponseLink — не переиспользует существующую активную
 * ссылку (варианты у каждого предложения свои), а отзывает (status=revoked)
 * прошлые активные reschedule_offer-ссылки этого приёма и создаёт новую —
 * чтобы у пациента не оставалось двух одновременно валидных наборов вариантов.
 * options хранятся в response (Json) как { kind: "options", options }: до
 * выбора пациента это единственное использование поля для purpose=reschedule_offer;
 * после выбора response перезаписывается итогом (см. selectRescheduleOptionAction).
 */
export async function createOrReplaceRescheduleOptionsLink(
  db: TenantClient,
  params: { patientId: string; appointmentId: string; options: RescheduleOption[] },
): Promise<{ id: string; token: string }> {
  await db.patientResponseLink.updateMany({
    where: { appointmentId: params.appointmentId, purpose: "reschedule_offer", status: "active" },
    data: { status: "revoked" },
  });

  const token = generateResponseToken();
  const expiresAt = new Date(Date.now() + RESPONSE_LINK_TTL_HOURS * 60 * 60 * 1000);
  return db.patientResponseLink.create({
    data: {
      patientId: params.patientId,
      appointmentId: params.appointmentId,
      token,
      purpose: "reschedule_offer",
      status: "active",
      expiresAt,
      response: { kind: "options", options: params.options },
    } as never,
    select: { id: true, token: true },
  });
}

/** Pre-use payload ссылки purpose=feedback — какую процедуру комментирует отзыв, если не привязан к приёму. */
interface PendingFeedbackContext {
  kind: "pending_feedback";
  treatmentItemId: string | null;
}

function isPendingFeedbackContext(v: unknown): v is PendingFeedbackContext {
  return !!v && typeof v === "object" && (v as Record<string, unknown>).kind === "pending_feedback";
}

export function parsePendingFeedbackTreatmentItemId(response: unknown): string | null {
  return isPendingFeedbackContext(response) ? response.treatmentItemId : null;
}

export const FEEDBACK_LINK_TTL_HOURS = 24 * 7; // 7 дней

/**
 * Ссылка для отзыва (сессия 45). В отличие от reschedule_offer — переиспользует
 * активную непросроченную ссылку для ТОЙ ЖЕ сущности (того же приёма либо той же
 * процедуры — сравнение по appointmentId-колонке либо по treatmentItemId внутри
 * response), а не создаёт новую при каждом клике. appointmentId — реальная
 * колонка (есть у приёма); treatmentItemId — только в response (у
 * PatientResponseLink нет такой колонки, заводить её под одно поле — overkill).
 */
export async function getOrCreateFeedbackLink(
  db: TenantClient,
  params: { patientId: string; appointmentId: string | null; treatmentItemId: string | null },
): Promise<{ id: string; token: string }> {
  const candidates = await db.patientResponseLink.findMany({
    where: { patientId: params.patientId, purpose: "feedback", status: "active", expiresAt: { gt: new Date() } },
    select: { id: true, token: true, appointmentId: true, response: true },
    orderBy: { createdAt: "desc" },
  });
  const existing = candidates.find((c) => {
    if (params.appointmentId) return c.appointmentId === params.appointmentId;
    if (params.treatmentItemId) return parsePendingFeedbackTreatmentItemId(c.response) === params.treatmentItemId;
    return false;
  });
  if (existing) return { id: existing.id, token: existing.token };

  const token = generateResponseToken();
  const expiresAt = new Date(Date.now() + FEEDBACK_LINK_TTL_HOURS * 60 * 60 * 1000);
  return db.patientResponseLink.create({
    data: {
      patientId: params.patientId,
      appointmentId: params.appointmentId,
      token,
      purpose: "feedback",
      status: "active",
      expiresAt,
      response: { kind: "pending_feedback", treatmentItemId: params.treatmentItemId },
    } as never,
    select: { id: true, token: true },
  });
}

export type PublicResponseLinkState =
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "used"; purpose: "confirm_appointment" | "reschedule_offer" | "feedback"; responseType: string | null }
  | {
      kind: "active";
      token: string;
      purpose: "confirm_appointment" | "reschedule_offer" | "feedback";
      clinicName: string;
      patientName: string;
      /** null — для feedback без привязанного приёма/процедуры с известным врачом. */
      doctorName: string | null;
      /** null — для feedback без привязанного приёма. */
      startsAt: Date | null;
      /** только для purpose === "reschedule_offer". */
      options?: RescheduleOption[];
      /** только для purpose === "feedback", когда известна процедура (без приёма). */
      serviceName?: string | null;
    };

/**
 * Публичное (без сессии) чтение по токену. Минимум данных, никаких internal id,
 * никакой медицинской/финансовой информации. clinicId/patientId/appointmentId
 * берутся ТОЛЬКО из найденной по token записи — без поиска по другим id.
 * purpose=reschedule_offer дополнительно возвращает options (сессия 43);
 * purpose=feedback — единственный purpose, где appointment опционален (сессия 45,
 * см. getOrCreateFeedbackLink) — остальные purpose требуют приём, как и раньше.
 */
export async function getPublicResponseLinkState(token: string): Promise<PublicResponseLinkState> {
  if (!TOKEN_FORMAT.test(token)) return { kind: "not_found" };

  const link = await prisma.patientResponseLink.findUnique({
    where: { token },
    select: {
      status: true,
      expiresAt: true,
      responseType: true,
      appointmentId: true,
      purpose: true,
      response: true,
      clinic: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
      appointment: {
        select: { startsAt: true, doctor: { select: { user: { select: { fullName: true } } } } },
      },
    },
  });
  if (!link) return { kind: "not_found" };

  const purpose: "confirm_appointment" | "reschedule_offer" | "feedback" =
    link.purpose === "reschedule_offer" ? "reschedule_offer" : link.purpose === "feedback" ? "feedback" : "confirm_appointment";

  // confirm_appointment/reschedule_offer всегда требуют приём; feedback — опционален.
  if (purpose !== "feedback" && (!link.appointmentId || !link.appointment)) {
    return { kind: "not_found" };
  }

  if (link.status === "used" || link.status === "revoked") {
    return { kind: "used", purpose, responseType: link.responseType };
  }
  if (link.status === "expired" || link.expiresAt.getTime() < Date.now()) {
    return { kind: "expired" };
  }

  let doctorName = link.appointment?.doctor.user.fullName ?? null;
  let serviceName: string | null = null;
  if (purpose === "feedback" && !link.appointment) {
    const treatmentItemId = parsePendingFeedbackTreatmentItemId(link.response);
    if (treatmentItemId) {
      const item = await prisma.treatmentItem.findUnique({
        where: { id: treatmentItemId },
        select: {
          service: { select: { name: true } },
          doctor: { select: { user: { select: { fullName: true } } } },
        },
      });
      serviceName = item?.service.name ?? null;
      doctorName = item?.doctor.user.fullName ?? null;
    }
  }

  return {
    kind: "active",
    token,
    purpose,
    clinicName: link.clinic.name,
    patientName: `${link.patient.lastName} ${link.patient.firstName}`,
    doctorName,
    startsAt: link.appointment?.startsAt ?? null,
    serviceName,
    ...(purpose === "reschedule_offer" ? { options: parseRescheduleOptions(link.response) } : {}),
  };
}
