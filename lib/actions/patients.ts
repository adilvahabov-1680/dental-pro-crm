"use server";

/**
 * Server actions модуля Pasiyentlər.
 * Безопасность: requirePermission("patients.manage") + tenantClient +
 * scope-проверка (врач/ассистент не могут редактировать чужого пациента) +
 * safeUpdateByTenant. Создание/изменение логируются в audit_logs.
 */
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import {
  patientInputSchema,
  issuesToFieldErrors,
  type PatientFormState,
  type PatientInput,
} from "@/lib/validation/patients";
import { CHILD_AGE_LIMIT, isChildPatient, normalizePhone } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return patientInputSchema.safeParse({
    ...raw,
    isChild: raw.isChild === "on" || raw.isChild === "true",
  });
}

/**
 * Himayəçi: ищем взрослого пациента клиники по телефону; нет — создаём
 * минимальную карточку (схема не меняется: guardian = обычный пациент, self-FK).
 */
async function resolveGuardianId(
  db: ReturnType<typeof tenantClient>,
  input: PatientInput,
  excludeId?: string,
): Promise<string | null> {
  if (!input.isChild || !input.guardianFullName || !input.guardianPhone) return null;
  const phone = normalizePhone(input.guardianPhone);
  const existing = await db.patient.findFirst({
    where: { phone, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) return existing.id;

  const parts = input.guardianFullName.trim().split(/\s+/);
  const firstName = parts[0] ?? input.guardianFullName;
  const lastName = parts.slice(1).join(" ") || "—";
  const created = (await db.patient.create({
    data: { firstName, lastName, phone, status: "active" },
  } as never)) as unknown as { id: string };
  return created.id;
}

function patientData(input: PatientInput, guardianId: string | null, user: SessionUser) {
  // врач без явного выбора получает пациента себе
  const primaryDoctorId =
    input.primaryDoctorId ?? (user.role === "doctor" ? user.doctorId : null);
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    fatherName: input.fatherName,
    phone: input.phone ? normalizePhone(input.phone) : null,
    email: input.email,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
    gender: input.gender,
    address: input.address,
    notes: input.notes,
    allergies: input.allergies,
    chronicDiseases: input.chronicDiseases,
    anamnesis: input.anamnesis,
    source: input.source,
    status: input.status,
    primaryDoctorId,
    guardianId,
  };
}

function auditSnapshot(data: ReturnType<typeof patientData>) {
  return {
    name: `${data.firstName} ${data.lastName}`,
    phone: data.phone,
    primaryDoctorId: data.primaryDoctorId,
    guardianId: data.guardianId,
    status: data.status,
    hasAllergies: !!data.allergies,
  };
}

export async function createPatient(
  _prev: PatientFormState | undefined,
  formData: FormData,
): Promise<PatientFormState> {
  const user = await requirePermission("patients.manage");
  if (!user.clinicId) redirect("/dashboard");
  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };

  const db = tenantClient(user.clinicId);
  let patientId: string;
  try {
    const guardianId = await resolveGuardianId(db, parsed.data);
    const data = patientData(parsed.data, guardianId, user);
    const patient = (await db.patient.create({ data } as never)) as unknown as {
      id: string;
      birthDate: Date | null;
      guardianId: string | null;
    };
    patientId = patient.id;

    // авто-создание контейнера зубной карты (DENTAL_CHART.md: карта создаётся
    // лениво/при регистрации; UI карты — будущая сессия)
    const chartType = isChildPatient(patient.birthDate, patient.guardianId) ? "child" : "adult";
    await db.dentalChart.create({ data: { patientId: patient.id, chartType } } as never);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "patient",
        entityId: patient.id,
        after: auditSnapshot(data),
      },
    } as never);
  } catch (e) {
    console.error("createPatient failed:", e);
    return { error: "generic" };
  }
  redirect(`/patients/${patientId}`);
}

export async function updatePatient(
  _prev: PatientFormState | undefined,
  formData: FormData,
): Promise<PatientFormState> {
  const user = await requirePermission("patients.manage");
  if (!user.clinicId) redirect("/dashboard");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "generic" };

  // scope-проверка: tenant + роль (врач/ассистент — только свои пациенты)
  const existing = await getPatientForUser(user, id);
  if (!existing) return { error: "generic" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };

  const db = tenantClient(user.clinicId);
  try {
    const guardianId = await resolveGuardianId(db, parsed.data, id);
    const data = patientData(parsed.data, guardianId, user);
    // принадлежность уже проверена getPatientForUser; update через findFirst-паттерн
    await db.patient.update({ where: { id }, data } as never);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "patient",
        entityId: id,
        before: {
          name: `${existing.firstName} ${existing.lastName}`,
          phone: existing.phone,
          primaryDoctorId: existing.primaryDoctorId,
          guardianId: existing.guardianId,
          status: existing.status,
          hasAllergies: !!existing.allergies,
        },
        after: auditSnapshot(data),
      },
    } as never);
  } catch (e) {
    console.error("updatePatient failed:", e);
    return { error: "generic" };
  }
  redirect(`/patients/${id}`);
}
