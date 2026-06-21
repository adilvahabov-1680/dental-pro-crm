/**
 * Patient Feedback / Review (сессия 45) — server-only queries.
 * Scope — тот же patientScopeWhere(user), что у TreatmentItem/RecallTask:
 * врач/ассистент видят отзывы только своих пациентов.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import type { SessionUser } from "@/types/auth";

async function patientScoped(user: SessionUser): Promise<Prisma.PatientFeedbackWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

const feedbackInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  appointment: {
    select: { startsAt: true, doctor: { select: { user: { select: { fullName: true } } } } },
  },
  treatmentItem: {
    select: {
      service: { select: { name: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
    },
  },
} satisfies Prisma.PatientFeedbackInclude;

export type PatientFeedbackFull = Prisma.PatientFeedbackGetPayload<{ include: typeof feedbackInclude }>;

/** Блок «Son rəylər» на карточке пациента — последние 10. */
export async function listPatientFeedback(user: SessionUser, patientId: string): Promise<PatientFeedbackFull[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.patientFeedback.findMany({
    where: { patientId },
    include: feedbackInclude,
    orderBy: { submittedAt: "desc" },
    take: 10,
  })) as PatientFeedbackFull[];
}

/** Страница «Pasiyent rəyləri» (/feedback) — последние 50 по клинике (с учётом scope). */
export async function listRecentFeedback(user: SessionUser): Promise<PatientFeedbackFull[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.patientFeedback.findMany({
    where: await patientScoped(user),
    include: feedbackInclude,
    orderBy: { submittedAt: "desc" },
    take: 50,
  })) as PatientFeedbackFull[];
}
