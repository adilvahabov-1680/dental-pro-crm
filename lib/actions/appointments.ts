"use server";

/**
 * Server actions модуля Qəbullar.
 * Безопасность: requirePermission("appointments.manage") + scope пациента
 * (getPatientForUser) + проверка врача в клинике + scope приёма при смене
 * статуса. Form input не считается доверенным: doctorId для роли doctor —
 * всегда свой, для assistant — прикреплённый врач.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantClient, safeUpdateByTenant } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { getAppointmentForUser, hasOverlap, toDateStr } from "@/lib/appointments";
import {
  appointmentCreateSchema,
  appointmentStatusSchema,
  type AppointmentFormState,
} from "@/lib/validation/appointments";
import { issuesToFieldErrors } from "@/lib/validation/patients";

export async function createAppointment(
  _prev: AppointmentFormState | undefined,
  formData: FormData,
): Promise<AppointmentFormState> {
  const user = await requirePermission("appointments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = appointmentCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  // пациент — только из scope пользователя (tenant + роль)
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { fieldErrors: { patientId: "patientRequired" } };

  // врач: form input не доверяем — роль фиксирует врача
  let doctorId = input.doctorId;
  if (user.role === "doctor" && user.doctorId) doctorId = user.doctorId;
  if (user.role === "assistant") {
    if (!user.assignedDoctorId) return { error: "doctorRequired" };
    doctorId = user.assignedDoctorId;
  }
  const db = tenantClient(user.clinicId);
  const doctor = await db.doctor.findFirst({
    where: { id: doctorId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!doctor) return { fieldErrors: { doctorId: "doctorRequired" } };

  // MVP: время — в таймзоне сервера (= клиники, Asia/Baku). TODO: tz-aware (DATABASE.md §0)
  const startsAt = new Date(`${input.date}T${input.time}:00`);
  if (Number.isNaN(startsAt.getTime())) return { fieldErrors: { date: "invalidDate" } };
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

  // запрет пересечения времени врача
  if (await hasOverlap(user.clinicId, doctorId, startsAt, endsAt)) {
    return { error: "overlap" };
  }

  let appointmentId: string;
  try {
    const created = (await db.appointment.create({
      data: {
        patientId: patient.id,
        doctorId,
        startsAt,
        endsAt,
        complaint: input.complaint,
        notes: input.notes,
        chair: input.chair,
        createdById: user.id,
      },
    } as never)) as unknown as { id: string };
    appointmentId = created.id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "appointment",
        entityId: appointmentId,
        after: {
          patientId: patient.id,
          doctorId,
          startsAt: startsAt.toISOString(),
          durationMin: input.durationMin,
        },
      },
    } as never);
  } catch (e) {
    console.error("createAppointment failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/appointments");
  revalidatePath(`/patients/${patient.id}`);
  redirect(`/appointments?view=day&date=${toDateStr(startsAt)}`);
}

export async function updateAppointmentStatus(
  _prev: AppointmentFormState | undefined,
  formData: FormData,
): Promise<AppointmentFormState> {
  const user = await requirePermission("appointments.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = appointmentStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { appointmentId, status } = parsed.data;

  // scope: doctor/assistant не доберутся до чужого приёма
  const appointment = await getAppointmentForUser(user, appointmentId);
  if (!appointment) return { error: "notFound" };
  if (appointment.status === status) return {};

  const db = tenantClient(user.clinicId);
  try {
    await safeUpdateByTenant(db.appointment, "Appointment", appointment.id, {
      status,
      ...(status === "late_cancelled" ? { lateCancelFlag: true } : {}),
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "appointment",
        entityId: appointment.id,
        before: { status: appointment.status },
        after: { status },
      },
    } as never);
  } catch (e) {
    console.error("updateAppointmentStatus failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/appointments");
  revalidatePath(`/patients/${appointment.patientId}`);
  return {};
}
