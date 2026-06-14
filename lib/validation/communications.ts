import { z } from "zod";
import { COMMUNICATION_CHANNELS } from "@/lib/communications";

export interface CommunicationFormState {
  error?: string;
  success?: boolean;
  /** wa.me-ссылка для открытия на клиенте (click-to-chat). */
  waUrl?: string;
}

/** Ручная запись в историю коммуникации (manual_note). */
export const logCommunicationSchema = z.object({
  patientId: z.string().uuid("notFound"),
  channel: z.enum(COMMUNICATION_CHANNELS, { message: "channelRequired" }),
  message: z.string().trim().min(1, "messageRequired").max(2000, "messageTooLong"),
});

export const prepareAppointmentReminderSchema = z.object({
  appointmentId: z.string().uuid("notFound"),
});

export const prepareInvoiceReminderSchema = z.object({
  invoiceId: z.string().uuid("notFound"),
});

export const prepareDocumentMessageSchema = z.object({
  documentId: z.string().uuid("notFound"),
});
