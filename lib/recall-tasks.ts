/**
 * Recall / 6-Month Checkup queue (сессия 44).
 * RecallTask — НЕ приём: отдельная задача-напоминание о будущем контроле
 * после завершённого лечения. Scope — как у TreatmentItem (по пациенту,
 * см. lib/treatments.ts): врач/ассистент видят только своих пациентов.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import type { SessionUser } from "@/types/auth";

/** "due soon" окно — 14 дней (сессия 44, фиксировано в v1, не настройка). */
export const RECALL_DUE_SOON_DAYS = 14;

export type RecallUrgency = "overdue" | "due_soon" | "upcoming";

/** today/dueDate сравниваются по календарной дате (без времени). */
export function classifyRecallUrgency(dueDate: Date, now: Date = new Date()): RecallUrgency {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime()) return "overdue";
  const dueSoonEnd = new Date(today);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + RECALL_DUE_SOON_DAYS);
  if (due.getTime() <= dueSoonEnd.getTime()) return "due_soon";
  return "upcoming";
}

async function patientScoped(user: SessionUser): Promise<Prisma.RecallTaskWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

const recallInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  doctor: { select: { id: true, user: { select: { fullName: true } } } },
  service: { select: { id: true, name: true } },
  treatmentItem: { select: { id: true, performedAt: true } },
} satisfies Prisma.RecallTaskInclude;

export type RecallTaskFull = Prisma.RecallTaskGetPayload<{ include: typeof recallInclude }>;

/** Активная очередь (pending/prepared), отсортирована по dueDate (раньше — выше). */
export async function listRecallQueue(user: SessionUser): Promise<RecallTaskFull[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.RecallTaskWhereInput[] = [
    { deletedAt: null, status: { in: ["pending", "prepared"] } },
    await patientScoped(user),
  ];
  return (await db.recallTask.findMany({
    where: { AND: and },
    include: recallInclude,
    orderBy: { dueDate: "asc" },
    take: 100,
  })) as RecallTaskFull[];
}

/** Recall в scope пользователя; чужой → null. */
export async function getRecallTaskForUser(
  user: SessionUser,
  id: string,
): Promise<RecallTaskFull | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.recallTask.findFirst({
    where: { AND: [{ id, deletedAt: null }, await patientScoped(user)] },
    include: recallInclude,
  })) as RecallTaskFull | null;
}

/** Счётчик due soon/overdue среди pending/prepared — для dashboard-тизера. */
export async function countDueRecalls(
  user: SessionUser,
): Promise<{ overdue: number; dueSoon: number }> {
  if (!user.clinicId) return { overdue: 0, dueSoon: 0 };
  const queue = await listRecallQueue(user);
  let overdue = 0;
  let dueSoon = 0;
  for (const r of queue) {
    const urgency = classifyRecallUrgency(r.dueDate);
    if (urgency === "overdue") overdue++;
    else if (urgency === "due_soon") dueSoon++;
  }
  return { overdue, dueSoon };
}
