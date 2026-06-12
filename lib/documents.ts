/**
 * Данные модуля Sənədlər (server-only).
 * v1: реестр сгенерированных PDF = pdf_records (append-only);
 * таблица documents (загруженные файлы: снимки, согласия) — следующая фаза,
 * на карточке пациента её записи показываются вместе с pdf_records.
 * Scope — по пациенту (как finance/treatments): врач видит документы своих
 * пациентов, ассистент — пациентов прикреплённого врача.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import type { SessionUser } from "@/types/auth";

async function patientScoped(user: SessionUser): Promise<Prisma.PdfRecordWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

const pdfRecordInclude = {
  patient: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PdfRecordInclude;

export type PdfRecordListItem = Prisma.PdfRecordGetPayload<{ include: typeof pdfRecordInclude }>;

export interface DocumentFilters {
  type?: string;
  q?: string;
  date?: string; // yyyy-mm-dd
}

export async function listDocuments(
  user: SessionUser,
  filters: DocumentFilters,
): Promise<PdfRecordListItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.PdfRecordWhereInput[] = [await patientScoped(user)];
  if (filters.type) and.push({ type: filters.type as never });
  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      patient: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    const [y, m, d] = filters.date.split("-").map(Number);
    const from = new Date(y, m - 1, d);
    const to = new Date(y, m - 1, d + 1);
    and.push({ createdAt: { gte: from, lt: to } });
  }
  return (await db.pdfRecord.findMany({
    where: { AND: and },
    include: pdfRecordInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as PdfRecordListItem[];
}

/** Документ в scope пользователя; чужой → null. */
export async function getDocumentForUser(
  user: SessionUser,
  id: string,
): Promise<PdfRecordListItem | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return (await db.pdfRecord.findFirst({
    where: { AND: [{ id }, await patientScoped(user)] },
    include: pdfRecordInclude,
  })) as PdfRecordListItem | null;
}

/** Имена создателей документов (generatedById → fullName). */
export async function documentCreatorNames(
  user: SessionUser,
  userIds: string[],
): Promise<Map<string, string>> {
  if (!user.clinicId || userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, clinicId: user.clinicId },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

export interface PatientDocumentRow {
  id: string;
  title: string;
  type: string;
  createdAt: Date;
  /** id pdf_record → есть страница /documents/[id]; uploaded document — нет (v1) */
  pdfRecordId: string | null;
}

/** Последние документы и PDF-записи пациента (для PatientDocumentsBlock). */
export async function listPatientDocumentRecords(
  user: SessionUser,
  patientId: string,
): Promise<PatientDocumentRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const [documents, pdfRecords] = await Promise.all([
    db.document.findMany({
      where: { patientId, deletedAt: null },
      select: { id: true, title: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.pdfRecord.findMany({
      where: { patientId },
      select: { id: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return [
    ...documents.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type as string,
      createdAt: d.createdAt,
      pdfRecordId: null,
    })),
    ...pdfRecords.map((p) => ({
      id: p.id,
      title: p.type as string, // метка берётся из PDF_TYPE_META на рендере
      type: p.type as string,
      createdAt: p.createdAt,
      pdfRecordId: p.id,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);
}

/** Все PDF-записи пациента (для /patients/[id]/documents). */
export async function listPatientPdfRecords(
  user: SessionUser,
  patientId: string,
): Promise<PdfRecordListItem[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return (await db.pdfRecord.findMany({
    where: { patientId },
    include: pdfRecordInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as PdfRecordListItem[];
}
