"use server";

/**
 * Server actions модуля Əlaqə / Communication (сессия 15, v1).
 * Все действия пишут запись в notifications (status=prepared) — это
 * единственный audit/history для коммуникации с пациентом в v1.
 * wa.me-ссылка возвращается клиенту, который сам открывает её
 * (window.open) — сервер ничего не отправляет.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getPatientForUser, patientScopeWhere } from "@/lib/patients";
import { getAppointmentForUser } from "@/lib/appointments";
import { getInvoiceForUser } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  normalizeAzPhone,
  buildWhatsAppUrl,
  appointmentReminderMessage,
  paymentReminderMessage,
  documentMessage,
} from "@/lib/communications";
import { DOCUMENT_TYPE_META } from "@/lib/constants";
import {
  logCommunicationSchema,
  prepareAppointmentReminderSchema,
  prepareInvoiceReminderSchema,
  prepareDocumentMessageSchema,
  type CommunicationFormState,
} from "@/lib/validation/communications";

async function clinicName(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true },
  });
  return clinic.name;
}

function revalidatePatient(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
}

/** Ручная запись в историю коммуникации («Qeydi əlavə et»). */
export async function logPatientCommunication(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("patients.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = logCommunicationSchema.safeParse({
    patientId: formData.get("patientId"),
    channel: formData.get("channel"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "generic" };
  const input = parsed.data;

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { error: "notFound" };

  try {
    const db = tenantClient(clinicId);
    const now = new Date();
    const record = await db.notification.create({
      data: {
        patientId: patient.id,
        channel: input.channel,
        type: "manual_note",
        body: input.message,
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
        after: { patientId: patient.id, channel: input.channel, type: "manual_note" },
      },
    } as never);
  } catch (e) {
    console.error("logPatientCommunication failed:", e);
    return { error: "generic" };
  }

  revalidatePatient(patient.id);
  return { success: true };
}

/** WhatsApp xatırlatma по приёму — генерирует текст + wa.me-ссылку, пишет лог. */
export async function prepareAppointmentReminder(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("appointments.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = prepareAppointmentReminderSchema.safeParse({
    appointmentId: formData.get("appointmentId"),
  });
  if (!parsed.success) return { error: "notFound" };

  const appointment = await getAppointmentForUser(user, parsed.data.appointmentId);
  if (!appointment) return { error: "notFound" };

  const phone = normalizeAzPhone(appointment.patient.phone);
  if (!phone) return { error: "noPhone" };

  try {
    const db = tenantClient(clinicId);
    const name = await clinicName(clinicId);
    const dt = new Date(appointment.startsAt);
    const text = appointmentReminderMessage({
      patientName: `${appointment.patient.lastName} ${appointment.patient.firstName}`,
      clinicName: name,
      date: formatDate(dt),
      time: dt.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" }),
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now = new Date();

    const record = await db.notification.create({
      data: {
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        channel: "whatsapp",
        type: "appointment_reminder",
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
          patientId: appointment.patient.id,
          appointmentId: appointment.id,
          channel: "whatsapp",
          type: "appointment_reminder",
        },
      },
    } as never);

    revalidatePatient(appointment.patient.id);
    revalidatePath("/dashboard");
    return { success: true, waUrl };
  } catch (e) {
    console.error("prepareAppointmentReminder failed:", e);
    return { error: "generic" };
  }
}

/** WhatsApp ödəniş xatırlatması по счёту — генерирует текст + wa.me-ссылку, пишет лог. */
export async function prepareInvoiceReminder(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("finance.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = prepareInvoiceReminderSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { error: "notFound" };

  const invoice = await getInvoiceForUser(user, parsed.data.invoiceId);
  if (!invoice) return { error: "notFound" };

  const phone = normalizeAzPhone(invoice.patient.phone);
  if (!phone) return { error: "noPhone" };

  try {
    const db = tenantClient(clinicId);
    const name = await clinicName(clinicId);
    const balance = invoice.total - invoice.paidAmount;
    const text = paymentReminderMessage({
      patientName: `${invoice.patient.lastName} ${invoice.patient.firstName}`,
      clinicName: name,
      balance: formatMoney(balance, "AZN"),
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now = new Date();

    const record = await db.notification.create({
      data: {
        patientId: invoice.patient.id,
        invoiceId: invoice.id,
        channel: "whatsapp",
        type: "payment_reminder",
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
          patientId: invoice.patient.id,
          invoiceId: invoice.id,
          channel: "whatsapp",
          type: "payment_reminder",
        },
      },
    } as never);

    revalidatePatient(invoice.patient.id);
    revalidatePath(`/finance/invoices/${invoice.id}`);
    return { success: true, waUrl };
  } catch (e) {
    console.error("prepareInvoiceReminder failed:", e);
    return { error: "generic" };
  }
}

/**
 * WhatsApp mesaj hazırla по загруженному документу. Не вставляет
 * локальную/приватную ссылку на скачивание — только название и заметку
 * "sənəd klinikada hazırdır".
 */
export async function prepareDocumentMessage(
  _prev: CommunicationFormState | undefined,
  formData: FormData,
): Promise<CommunicationFormState> {
  const user = await requirePermission("documents.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = prepareDocumentMessageSchema.safeParse({
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) return { error: "notFound" };

  const db = tenantClient(clinicId);
  const scope = await patientScopeWhere(user);
  const doc = await db.document.findFirst({
    where: {
      AND: [
        { id: parsed.data.documentId, deletedAt: null },
        Object.keys(scope).length ? { patient: scope } : {},
      ],
    },
    select: {
      id: true,
      type: true,
      title: true,
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });
  if (!doc || !doc.patient) return { error: "notFound" };

  const phone = normalizeAzPhone(doc.patient.phone);
  if (!phone) return { error: "noPhone" };

  try {
    const name = await clinicName(clinicId);
    const docLabel = doc.title || DOCUMENT_TYPE_META[doc.type]?.az || doc.type;
    const text = documentMessage({
      patientName: `${doc.patient.lastName} ${doc.patient.firstName}`,
      clinicName: name,
      docLabel,
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now = new Date();

    const record = await db.notification.create({
      data: {
        patientId: doc.patient.id,
        documentId: doc.id,
        channel: "whatsapp",
        type: "document_message",
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
          patientId: doc.patient.id,
          documentId: doc.id,
          channel: "whatsapp",
          type: "document_message",
        },
      },
    } as never);

    revalidatePatient(doc.patient.id);
    revalidatePath(`/patients/${doc.patient.id}/documents`);
    return { success: true, waUrl };
  } catch (e) {
    console.error("prepareDocumentMessage failed:", e);
    return { error: "generic" };
  }
}
