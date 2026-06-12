/**
 * Данные модуля Sənədlər (server-only).
 * Два источника: pdf_records (сгенерированные PDF, append-only) и
 * documents (загруженные файлы пациента: снимки, согласия — сессия 14).
 * UI показывает оба через DocumentListRow (kind: "pdf" | "upload").
 * Scope — по пациенту (как finance/treatments): врач видит документы своих
 * пациентов, ассистент — пациентов прикреплённого врача.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { patientScopeWhere } from "@/lib/patients";
import {
  GENERATABLE_PDF_TYPES,
  UPLOAD_DOCUMENT_TYPES,
} from "@/lib/validation/documents";
import type { SessionUser } from "@/types/auth";

async function patientScoped(user: SessionUser): Promise<Prisma.PdfRecordWhereInput> {
  const scope = await patientScopeWhere(user);
  return Object.keys(scope).length ? { patient: scope } : {};
}

/** Тот же ролевой scope для загруженных документов (relation patient обязателен). */
async function documentScoped(user: SessionUser): Promise<Prisma.DocumentWhereInput> {
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

/** Единая строка списка: сгенерированный PDF или загруженный файл. */
export interface DocumentListRow {
  id: string;
  kind: "pdf" | "upload";
  /** PdfType (kind=pdf) или DocumentType (kind=upload) */
  type: string;
  /** заголовок загруженного файла; для PDF — null (метка из PDF_TYPE_META) */
  title: string | null;
  mimeType: string | null;
  createdAt: Date;
  patient: { id: string; firstName: string; lastName: string } | null;
}

function patientNameFilter(q: string) {
  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" as const } },
      { lastName: { contains: q, mode: "insensitive" as const } },
    ],
  };
}

function dateRange(date?: string): { gte: Date; lt: Date } | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  return { gte: new Date(y, m - 1, d), lt: new Date(y, m - 1, d + 1) };
}

const isPdfType = (t: string) => (GENERATABLE_PDF_TYPES as readonly string[]).includes(t);
const isUploadType = (t: string) => (UPLOAD_DOCUMENT_TYPES as readonly string[]).includes(t);

/** Сгенерированные PDF + загруженные файлы одним списком (фильтры общие). */
export async function listDocuments(
  user: SessionUser,
  filters: DocumentFilters,
): Promise<DocumentListRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const range = dateRange(filters.date);

  // фильтр по типу принадлежит ровно одному источнику
  const wantPdf = !filters.type || isPdfType(filters.type);
  const wantUpload = !filters.type || isUploadType(filters.type);

  const pdfAnd: Prisma.PdfRecordWhereInput[] = [await patientScoped(user)];
  const docAnd: Prisma.DocumentWhereInput[] = [{ deletedAt: null }, await documentScoped(user)];
  if (filters.type && wantPdf) pdfAnd.push({ type: filters.type as never });
  if (filters.type && wantUpload) docAnd.push({ type: filters.type as never });
  if (filters.q) {
    const q = filters.q.trim();
    pdfAnd.push({ patient: patientNameFilter(q) });
    docAnd.push({ patient: patientNameFilter(q) });
  }
  if (range) {
    pdfAnd.push({ createdAt: range });
    docAnd.push({ createdAt: range });
  }

  const [pdfRecords, documents] = await Promise.all([
    wantPdf
      ? db.pdfRecord.findMany({
          where: { AND: pdfAnd },
          include: pdfRecordInclude,
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    wantUpload
      ? db.document.findMany({
          where: { AND: docAnd },
          select: {
            id: true,
            type: true,
            title: true,
            mimeType: true,
            createdAt: true,
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  return [
    ...(pdfRecords as PdfRecordListItem[]).map<DocumentListRow>((r) => ({
      id: r.id,
      kind: "pdf",
      type: r.type as string,
      title: null,
      mimeType: "application/pdf",
      createdAt: r.createdAt,
      patient: r.patient,
    })),
    ...documents.map<DocumentListRow>((d) => ({
      id: d.id,
      kind: "upload",
      type: d.type as string,
      title: d.title,
      mimeType: d.mimeType,
      createdAt: d.createdAt,
      patient: d.patient,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
}

/** Загруженный документ в scope пользователя; чужой → null. */
export async function getUploadedDocumentForUser(user: SessionUser, id: string) {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return db.document.findFirst({
    where: { AND: [{ id, deletedAt: null }, await documentScoped(user)] },
    select: {
      id: true,
      patientId: true,
      type: true,
      title: true,
      fileUrl: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
    },
  });
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

/**
 * Все документы пациента — PDF-записи и загруженные файлы
 * (для /patients/[id]/documents; вызывать ПОСЛЕ getPatientForUser).
 */
export async function listPatientDocuments(
  user: SessionUser,
  patientId: string,
): Promise<DocumentListRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const [pdfRecords, documents] = await Promise.all([
    db.pdfRecord.findMany({
      where: { patientId },
      include: pdfRecordInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.document.findMany({
      where: { patientId, deletedAt: null },
      select: {
        id: true,
        type: true,
        title: true,
        mimeType: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return [
    ...(pdfRecords as PdfRecordListItem[]).map<DocumentListRow>((r) => ({
      id: r.id,
      kind: "pdf",
      type: r.type as string,
      title: null,
      mimeType: "application/pdf",
      createdAt: r.createdAt,
      patient: r.patient,
    })),
    ...documents.map<DocumentListRow>((d) => ({
      id: d.id,
      kind: "upload",
      type: d.type as string,
      title: d.title,
      mimeType: d.mimeType,
      createdAt: d.createdAt,
      patient: d.patient,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
}
