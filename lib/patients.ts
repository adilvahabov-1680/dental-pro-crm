/**
 * Запросы модуля Pasiyentlər (server-only, не "use server").
 * Все выборки — через tenantClient (auto clinic_id) + ролевой scope.
 *
 * Scope (DATABASE.md §3):
 *  - doctor:    пациенты с primaryDoctorId = его doctorId
 *               (если clinic-setting doctor_sees_all_patients=true — все пациенты клиники);
 *  - assistant: пациенты прикреплённого врача (assignedDoctorId), та же настройка;
 *  - owner/admin/reception/accountant: все пациенты клиники;
 *  - super_admin: не имеет patients.view — requirePermission уводит на /dashboard.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { CHILD_AGE_LIMIT, normalizePhone } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";

export const PATIENTS_PAGE_SIZE = 10;

export interface PatientListFilters {
  q?: string;
  doctorId?: string;
  type?: "adult" | "child";
  gender?: "male" | "female";
  allergy?: "yes";
  status?: "active" | "archived";
  created?: "recent30";
  page?: number;
}

function childBirthCutoff(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - CHILD_AGE_LIMIT);
  return d;
}

async function clinicSettingBool(clinicId: string, key: string): Promise<boolean> {
  const setting = await prisma.setting.findFirst({
    where: { clinicId, scope: "clinic", key },
    select: { value: true },
  });
  return setting?.value === true;
}

/** Ролевой scope поверх tenant-фильтра. */
export async function patientScopeWhere(user: SessionUser): Promise<Prisma.PatientWhereInput> {
  if (user.role === "doctor" || user.role === "assistant") {
    const doctorId = user.role === "doctor" ? user.doctorId : user.assignedDoctorId;
    if (!doctorId) return { id: "00000000-0000-0000-0000-000000000000" }; // нет врача → пусто
    const seesAll = user.clinicId
      ? await clinicSettingBool(user.clinicId, "doctor_sees_all_patients")
      : false;
    if (!seesAll) return { primaryDoctorId: doctorId };
  }
  return {};
}

function filtersWhere(f: PatientListFilters): Prisma.PatientWhereInput {
  const and: Prisma.PatientWhereInput[] = [{ deletedAt: null }];
  const cutoff = childBirthCutoff();

  if (f.q) {
    const q = f.q.trim();
    const qPhone = normalizePhone(q);
    const or: Prisma.PatientWhereInput[] = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { fatherName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
    if (qPhone.replace("+", "").length >= 3) {
      or.push({ phone: { contains: qPhone } });
      // для детей — поиск по телефону himayəçi
      or.push({ guardian: { phone: { contains: qPhone } } });
    }
    and.push({ OR: or });
  }
  if (f.doctorId) and.push({ primaryDoctorId: f.doctorId });
  if (f.gender) and.push({ gender: f.gender });
  if (f.allergy === "yes") and.push({ allergies: { not: null } }, { allergies: { not: "" } });
  if (f.status) and.push({ status: f.status });
  else and.push({ status: "active" });
  if (f.created === "recent30") {
    and.push({ createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } });
  }
  if (f.type === "child") {
    and.push({ OR: [{ guardianId: { not: null } }, { birthDate: { gt: cutoff } }] });
  }
  if (f.type === "adult") {
    and.push({ guardianId: null }, { OR: [{ birthDate: null }, { birthDate: { lte: cutoff } }] });
  }
  return { AND: and };
}

const listInclude = {
  primaryDoctor: { select: { id: true, user: { select: { fullName: true } } } },
  guardian: { select: { id: true, firstName: true, lastName: true, phone: true } },
  // «Son ziyarət» = последний завершённый приём
  appointments: {
    where: { status: "completed", deletedAt: null },
    orderBy: { startsAt: "desc" },
    take: 1,
    select: { startsAt: true },
  },
} satisfies Prisma.PatientInclude;

export type PatientListItem = Prisma.PatientGetPayload<{ include: typeof listInclude }>;

export async function listPatients(user: SessionUser, filters: PatientListFilters) {
  if (!user.clinicId) return { items: [] as PatientListItem[], total: 0, page: 1 };
  const db = tenantClient(user.clinicId);
  const scope = await patientScopeWhere(user);
  const where: Prisma.PatientWhereInput = { AND: [scope, filtersWhere(filters)] };
  const page = Math.max(1, filters.page ?? 1);

  const [items, total] = await Promise.all([
    db.patient.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PATIENTS_PAGE_SIZE,
      take: PATIENTS_PAGE_SIZE,
    }),
    db.patient.count({ where }),
  ]);
  return { items: items as PatientListItem[], total, page };
}

const detailInclude = {
  primaryDoctor: { select: { id: true, user: { select: { fullName: true } } } },
  guardian: { select: { id: true, firstName: true, lastName: true, phone: true } },
  children: {
    where: { deletedAt: null },
    select: { id: true, firstName: true, lastName: true, birthDate: true },
  },
} satisfies Prisma.PatientInclude;

export type PatientDetail = Prisma.PatientGetPayload<{ include: typeof detailInclude }>;

/**
 * Пациент по id В ПРЕДЕЛАХ scope пользователя (tenant + роль).
 * Чужой пациент (другая клиника или вне scope врача) → null.
 */
export async function getPatientForUser(
  user: SessionUser,
  id: string,
): Promise<PatientDetail | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  const scope = await patientScopeWhere(user);
  const patient = await db.patient.findFirst({
    where: { AND: [{ id, deletedAt: null }, scope] },
    include: detailInclude,
  });
  return patient as PatientDetail | null;
}

/** Опции пациентов для select'ов (scope роли учитывается). MVP: до 200. */
export async function listPatientOptions(user: SessionUser) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const scope = await patientScopeWhere(user);
  return db.patient.findMany({
    where: { AND: [scope, { deletedAt: null, status: "active" }] },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: { lastName: "asc" },
    take: 200,
  });
}

/** Активные врачи клиники для select'ов. */
export async function listClinicDoctors(user: SessionUser) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.doctor.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}
