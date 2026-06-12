/**
 * Данные модуля Diş xəritəsi (server-only).
 * Доступ к карте = доступ к пациенту: scope через getPatientForUser()
 * (tenant + роль: врач — свои, ассистент — пациенты прикреплённого врача).
 */
import { Prisma, ChartType, Dentition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { getPatientForUser, type PatientDetail } from "@/lib/patients";
import { isChildPatient } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";

// FDI-раскладка: порядок отрисовки слева направо для каждой челюсти
export const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export function expectedTeeth(chartType: ChartType): number[] {
  return chartType === "adult"
    ? [...ADULT_UPPER, ...ADULT_LOWER]
    : [...CHILD_UPPER, ...CHILD_LOWER];
}

/** Квадрант по FDI-номеру: 1/5 üst sağ, 2/6 üst sol, 3/7 alt sol, 4/8 alt sağ. */
export function quadrantKey(toothNumber: number): "q1" | "q2" | "q3" | "q4" {
  const q = Math.floor(toothNumber / 10);
  if (q === 1 || q === 5) return "q1";
  if (q === 2 || q === 6) return "q2";
  if (q === 3 || q === 7) return "q3";
  return "q4";
}

const recordInclude = {
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.ToothRecordInclude;

export type ToothRecordWithDoctor = Prisma.ToothRecordGetPayload<{
  include: typeof recordInclude;
}>;

export interface PatientChartData {
  patient: PatientDetail;
  chart: { id: string; chartType: ChartType };
  records: ToothRecordWithDoctor[];
}

/** Чтобы зуба «без записи» не существовало: досоздаёт недостающие tooth_records. */
async function ensureToothRecords(
  db: ReturnType<typeof tenantClient>,
  user: SessionUser,
  patientId: string,
  chart: { id: string; chartType: ChartType },
): Promise<void> {
  const existing = await db.toothRecord.findMany({
    where: { dentalChartId: chart.id },
    select: { toothNumber: true },
  });
  const have = new Set(existing.map((r) => r.toothNumber));
  const missing = expectedTeeth(chart.chartType).filter((n) => !have.has(n));
  if (missing.length === 0) return;

  const dentition: Dentition = chart.chartType === "adult" ? "permanent" : "primary";
  await db.toothRecord.createMany({
    data: missing.map((toothNumber) => ({
      patientId,
      dentalChartId: chart.id,
      toothNumber,
      dentition,
      updatedById: user.id,
    })),
    skipDuplicates: true,
  } as never);
}

/**
 * Карта пациента: scope-проверка → контейнер (создаётся лениво по типу
 * пациента) → полный набор tooth_records. null = пациент вне scope/тенанта.
 */
export async function getPatientDentalChart(
  user: SessionUser,
  patientId: string,
): Promise<PatientChartData | null> {
  const patient = await getPatientForUser(user, patientId);
  if (!patient || !user.clinicId) return null;
  const db = tenantClient(user.clinicId);

  const chartType: ChartType = isChildPatient(patient.birthDate, patient.guardianId)
    ? "child"
    : "adult";

  let chart = await db.dentalChart.findFirst({
    where: { patientId, chartType, deletedAt: null },
    select: { id: true, chartType: true },
  });
  if (!chart) {
    chart = (await db.dentalChart.create({
      data: { patientId, chartType },
      select: { id: true, chartType: true },
    } as never)) as { id: string; chartType: ChartType };
  }

  await ensureToothRecords(db, user, patientId, chart);

  const records = await db.toothRecord.findMany({
    where: { dentalChartId: chart.id, deletedAt: null },
    include: recordInclude,
    orderBy: { toothNumber: "asc" },
  });

  return { patient, chart, records: records as ToothRecordWithDoctor[] };
}

export interface ToothHistoryItem {
  id: string;
  changeType: string;
  previousStatus: string | null;
  newStatus: string | null;
  diagnosis: string | null;
  procedureDone: string | null;
  doctorNote: string | null;
  changedByName: string;
  createdAt: Date;
}

/** История зуба (append-only лента) + имена авторов изменений. */
export async function getToothHistory(
  user: SessionUser,
  toothRecordId: string,
): Promise<ToothHistoryItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.toothHistory.findMany({
    where: { toothRecordId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const userIds = [...new Set(rows.map((r) => r.changedById))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, clinicId: user.clinicId },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id,
    changeType: r.changeType,
    previousStatus: r.previousStatus,
    newStatus: r.newStatus,
    diagnosis: r.diagnosis,
    procedureDone: r.procedureDone,
    doctorNote: r.doctorNote,
    changedByName: names.get(r.changedById) ?? "—",
    createdAt: r.createdAt,
  }));
}
