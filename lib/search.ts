/**
 * Global search v1 (сессия 16): patients / appointments / invoices / documents
 * / services. Tenant-scope через tenantClient, ролевой scope — те же helper'ы,
 * что в соответствующих модулях (patientScopeWhere, appointmentScopeWhere).
 * Группа результатов отсутствует молча, если у пользователя нет права на
 * соответствующий модуль (*.view) — никакой утечки наличия данных.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { patientScopeWhere } from "@/lib/patients";
import { appointmentScopeWhere, toDateStr } from "@/lib/appointments";
import { normalizePhone, formatDate, formatMoney } from "@/lib/utils";
import {
  formatInvoiceNumber,
  INVOICE_STATUS_META,
  APPOINTMENT_STATUS_META,
  DOCUMENT_TYPE_META,
  PDF_TYPE_META,
} from "@/lib/constants";
import type { SessionUser } from "@/types/auth";

export const SEARCH_MIN_LENGTH = 2;
const TYPE_LIMIT = 8;

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchResult {
  patients: SearchResultItem[];
  appointments: SearchResultItem[];
  invoices: SearchResultItem[];
  documents: SearchResultItem[];
  services: SearchResultItem[];
}

const EMPTY: GlobalSearchResult = {
  patients: [],
  appointments: [],
  invoices: [],
  documents: [],
  services: [],
};

type Db = ReturnType<typeof tenantClient>;

async function searchPatients(db: Db, user: SessionUser, q: string): Promise<SearchResultItem[]> {
  const scope = await patientScopeWhere(user);
  const or: Prisma.PatientWhereInput[] = [
    { firstName: { contains: q, mode: "insensitive" } },
    { lastName: { contains: q, mode: "insensitive" } },
  ];
  const qPhone = normalizePhone(q);
  if (qPhone.replace("+", "").length >= 2) or.push({ phone: { contains: qPhone } });

  const patients = await db.patient.findMany({
    where: { AND: [scope, { deletedAt: null }, { OR: or }] },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: { lastName: "asc" },
    take: TYPE_LIMIT,
  });
  return patients.map((p) => ({
    id: p.id,
    title: `${p.lastName} ${p.firstName}`,
    subtitle: p.phone ?? "",
    href: `/patients/${p.id}`,
  }));
}

async function searchAppointments(db: Db, user: SessionUser, q: string): Promise<SearchResultItem[]> {
  const appts = await db.appointment.findMany({
    where: {
      AND: [
        { deletedAt: null },
        appointmentScopeWhere(user),
        {
          OR: [
            { patient: { firstName: { contains: q, mode: "insensitive" } } },
            { patient: { lastName: { contains: q, mode: "insensitive" } } },
            { doctor: { user: { fullName: { contains: q, mode: "insensitive" } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      startsAt: true,
      status: true,
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { startsAt: "desc" },
    take: TYPE_LIMIT,
  });
  return appts.map((a) => {
    const dt = new Date(a.startsAt);
    const time = dt.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
    return {
      id: a.id,
      title: `${a.patient.lastName} ${a.patient.firstName}`,
      subtitle: `${formatDate(dt)} ${time} · ${a.doctor.user.fullName} · ${
        APPOINTMENT_STATUS_META[a.status]?.az ?? a.status
      }`,
      href: `/appointments?view=day&date=${toDateStr(dt)}`,
    };
  });
}

async function searchInvoices(db: Db, user: SessionUser, q: string): Promise<SearchResultItem[]> {
  const scope = await patientScopeWhere(user);
  const patientFilter = Object.keys(scope).length ? { patient: scope } : {};

  const or: Prisma.InvoiceWhereInput[] = [
    { patient: { firstName: { contains: q, mode: "insensitive" } } },
    { patient: { lastName: { contains: q, mode: "insensitive" } } },
  ];
  const digits = q.replace(/\D/g, "");
  if (digits) {
    const n = Number(digits);
    if (Number.isInteger(n) && n > 0) or.push({ number: n });
  }

  const invoices = await db.invoice.findMany({
    where: { AND: [{ deletedAt: null }, patientFilter, { OR: or }] },
    select: {
      id: true,
      number: true,
      total: true,
      paidAmount: true,
      status: true,
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TYPE_LIMIT,
  });
  return invoices.map((inv) => ({
    id: inv.id,
    title: formatInvoiceNumber(inv.number),
    subtitle: `${inv.patient.lastName} ${inv.patient.firstName} · ${formatMoney(
      inv.total - inv.paidAmount,
    )} · ${INVOICE_STATUS_META[inv.status]?.az ?? inv.status}`,
    href: `/finance/invoices/${inv.id}`,
  }));
}

async function searchDocuments(db: Db, user: SessionUser, q: string): Promise<SearchResultItem[]> {
  const scope = await patientScopeWhere(user);
  const patientFilter = Object.keys(scope).length ? { patient: scope } : {};
  const qLower = q.toLowerCase();

  const matchingPdfTypes = Object.entries(PDF_TYPE_META)
    .filter(([, m]) => m.az.toLowerCase().includes(qLower))
    .map(([k]) => k);
  const matchingDocTypes = Object.entries(DOCUMENT_TYPE_META)
    .filter(([, m]) => m.az.toLowerCase().includes(qLower))
    .map(([k]) => k);

  const pdfOr: Prisma.PdfRecordWhereInput[] = [
    { patient: { firstName: { contains: q, mode: "insensitive" } } },
    { patient: { lastName: { contains: q, mode: "insensitive" } } },
  ];
  if (matchingPdfTypes.length) pdfOr.push({ type: { in: matchingPdfTypes as never[] } });

  const docOr: Prisma.DocumentWhereInput[] = [
    { title: { contains: q, mode: "insensitive" } },
    { patient: { firstName: { contains: q, mode: "insensitive" } } },
    { patient: { lastName: { contains: q, mode: "insensitive" } } },
  ];
  if (matchingDocTypes.length) docOr.push({ type: { in: matchingDocTypes as never[] } });

  const [pdfRecords, documents] = await Promise.all([
    db.pdfRecord.findMany({
      where: { AND: [patientFilter, { OR: pdfOr }] },
      select: {
        id: true,
        type: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: TYPE_LIMIT,
    }),
    db.document.findMany({
      where: { AND: [{ deletedAt: null }, patientFilter, { OR: docOr }] },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: TYPE_LIMIT,
    }),
  ]);

  const items = [
    ...pdfRecords
      .filter((r) => r.patient)
      .map((r) => ({
        id: r.id,
        title: PDF_TYPE_META[r.type]?.az ?? r.type,
        subtitle: `${r.patient!.lastName} ${r.patient!.firstName}`,
        href: `/documents/${r.id}`,
        createdAt: r.createdAt,
      })),
    ...documents
      .filter((d) => d.patient)
      .map((d) => ({
        id: d.id,
        title: d.title || DOCUMENT_TYPE_META[d.type]?.az || d.type,
        subtitle: `${d.patient!.lastName} ${d.patient!.firstName} · ${DOCUMENT_TYPE_META[d.type]?.az ?? d.type}`,
        href: `/patients/${d.patient!.id}/documents`,
        createdAt: d.createdAt,
      })),
  ];

  return items
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TYPE_LIMIT)
    .map(({ createdAt, ...rest }) => {
      void createdAt;
      return rest;
    });
}

async function searchServices(db: Db, q: string): Promise<SearchResultItem[]> {
  const services = await db.service.findMany({
    where: {
      AND: [
        { deletedAt: null },
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { category: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
      ],
    },
    select: { id: true, name: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: TYPE_LIMIT,
  });
  return services.map((s) => ({
    id: s.id,
    title: s.name,
    subtitle: s.category?.name ?? "",
    href: `/settings/services`,
  }));
}

/** Глобальный поиск по основным сущностям (v1). Min 2 символа, tenant + scope. */
export async function globalSearch(user: SessionUser, rawQuery: string): Promise<GlobalSearchResult> {
  const q = rawQuery.trim();
  if (!user.clinicId || q.length < SEARCH_MIN_LENGTH) return EMPTY;
  const db = tenantClient(user.clinicId);

  const [patients, appointments, invoices, documents, services] = await Promise.all([
    hasPermission(user, "patients.view") ? searchPatients(db, user, q) : Promise.resolve([]),
    hasPermission(user, "appointments.view") ? searchAppointments(db, user, q) : Promise.resolve([]),
    hasPermission(user, "finance.view") ? searchInvoices(db, user, q) : Promise.resolve([]),
    hasPermission(user, "documents.view") ? searchDocuments(db, user, q) : Promise.resolve([]),
    hasPermission(user, "settings.view") ? searchServices(db, q) : Promise.resolve([]),
  ]);

  return { patients, appointments, invoices, documents, services };
}
