"use server";

/**
 * Staff-side server action модуля Patient Reschedule Options (сессия 43).
 * Принцип, как и в lib/actions/communications.ts: action только готовит
 * текст + wa.me-ссылку и пишет лог (status=prepared) — сервер ничего не
 * отправляет, сотрудник сам открывает wa.me-ссылку. Appointment НЕ
 * переносится здесь — перенос происходит только когда пациент выбирает
 * вариант по публичной ссылке (lib/actions/patient-response.ts).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getAppointmentForUser } from "@/lib/appointments";
import { normalizeAzPhone, buildWhatsAppUrl, rescheduleOptionsMessage } from "@/lib/communications";
import {
  createOrReplaceRescheduleOptionsLink,
  buildPatientResponseUrl,
  type RescheduleOption,
} from "@/lib/patient-response";
import {
  proposeRescheduleOptionsSchema,
  RESCHEDULE_OPTIONS_MIN,
  RESCHEDULE_OPTIONS_MAX,
  type RescheduleOptionsFormState,
} from "@/lib/validation/reschedule-options";

async function clinicName(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true },
  });
  return clinic.name;
}

/**
 * Создаёт 2–3 предложенных варианта времени для приёма со статусом
 * reschedule_requested, готовит WhatsApp-сообщение со ссылкой и пишет
 * запись в историю коммуникации. Appointment не двигается.
 */
export async function proposeRescheduleOptions(
  _prev: RescheduleOptionsFormState | undefined,
  formData: FormData,
): Promise<RescheduleOptionsFormState> {
  const user = await requirePermission("appointments.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = proposeRescheduleOptionsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "optionsInvalid" };
  const input = parsed.data;

  const appointment = await getAppointmentForUser(user, input.appointmentId);
  if (!appointment) return { error: "notFound" };
  if (appointment.status !== "reschedule_requested") return { error: "notRescheduleRequested" };

  const phone = normalizeAzPhone(appointment.patient.phone);
  if (!phone) return { error: "noPhone" };

  const durationMs = new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime();
  const rawInputs: Array<[string, string]> = [
    [input.option1Date, input.option1Time],
    [input.option2Date, input.option2Time],
  ];
  if (input.option3Date && input.option3Time) rawInputs.push([input.option3Date, input.option3Time]);

  const now = Date.now();
  const seen = new Set<number>();
  const options: RescheduleOption[] = [];
  for (const [date, time] of rawInputs) {
    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) return { error: "optionsInvalid" };
    if (startsAt.getTime() <= now) return { error: "optionsPast" };
    if (seen.has(startsAt.getTime())) return { error: "optionsDuplicate" };
    seen.add(startsAt.getTime());
    options.push({
      id: String(options.length + 1),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + durationMs).toISOString(),
    });
  }
  if (options.length < RESCHEDULE_OPTIONS_MIN || options.length > RESCHEDULE_OPTIONS_MAX) {
    return { error: "optionsTooFew" };
  }

  try {
    const db = tenantClient(clinicId);
    const name = await clinicName(clinicId);
    const link = await createOrReplaceRescheduleOptionsLink(db, {
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      options,
    });
    const optionsUrl = await buildPatientResponseUrl(link.token);
    const text = rescheduleOptionsMessage({
      patientName: `${appointment.patient.lastName} ${appointment.patient.firstName}`,
      clinicName: name,
      optionsUrl,
    });
    const waUrl = buildWhatsAppUrl(phone, text);
    const now2 = new Date();

    const record = await db.notification.create({
      data: {
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        channel: "whatsapp",
        type: "reschedule_offer",
        body: text,
        status: "prepared",
        scheduledAt: now2,
        sentAt: now2,
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
          type: "reschedule_offer",
          optionsCount: options.length,
        },
      },
    } as never);

    revalidatePath(`/patients/${appointment.patient.id}`);
    revalidatePath("/dashboard");
    return { success: true, waUrl };
  } catch (e) {
    console.error("proposeRescheduleOptions failed:", e);
    return { error: "generic" };
  }
}
