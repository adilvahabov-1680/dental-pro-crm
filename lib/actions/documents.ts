"use server";

/**
 * Server actions модуля Sənədlər: генерация PDF.
 * Права: documents.manage (owner/admin/doctor). Scope перепроверяется
 * через getPatientForUser / getInvoiceForUser — чужой пациент/счёт → ошибка.
 * Порядок: данные → рендер PDF → файл в uploads/ → pdf_record → audit_log.
 * Если запись не создалась, остаётся осиротевший файл (не критично);
 * если файл потеряется — download вернёт 404, страница покажет fileMissing.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getPatientForUser, patientScopeWhere } from "@/lib/patients";
import { getInvoiceForUser, paymentReceiverNames } from "@/lib/finance";
import { renderTreatmentSummaryPdf, renderInvoicePdf } from "@/lib/pdf";
import { saveUploadFile } from "@/lib/storage";
import {
  TOOTH_STATUS_META,
  TREATMENT_ITEM_STATUS_META,
  INVOICE_STATUS_META,
  PAYMENT_METHOD_META,
  formatInvoiceNumber,
  formatDocumentNumber,
} from "@/lib/constants";
import { calcAge } from "@/lib/utils";
import {
  treatmentSummarySchema,
  invoicePdfSchema,
  uploadDocumentSchema,
  deleteDocumentSchema,
  sniffUploadMime,
  sanitizeOriginalName,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_EXT,
  type DocumentFormState,
} from "@/lib/validation/documents";

const DEFAULT_RECOMMENDATIONS =
  "Tövsiyələr həkim tərəfindən pasiyentə izah edilmişdir. " +
  "Növbəti kontrol müayinəsi üçün klinika ilə əlaqə saxlayın.";

function newFileName(prefix: string, ext = "pdf"): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${randomBytes(4).toString("hex")}.${ext}`;
}

async function clinicInfo(clinicId: string) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true, phone: true, address: true },
  });
  return clinic;
}

export async function generateTreatmentSummary(
  _prev: DocumentFormState | undefined,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requirePermission("documents.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = treatmentSummarySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "patientNotFound" };

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, parsed.data.patientId);
  if (!patient) return { error: "patientNotFound" };

  let recordId: string;
  try {
    const db = tenantClient(clinicId);
    const [clinic, items, teeth, count] = await Promise.all([
      clinicInfo(clinicId),
      db.treatmentItem.findMany({
        where: { patientId: patient.id, deletedAt: null, status: { not: "cancelled" } },
        include: {
          service: { select: { name: true } },
          doctor: { select: { user: { select: { fullName: true } } } },
        },
        orderBy: [{ performedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 15,
      }),
      db.toothRecord.findMany({
        where: { patientId: patient.id, deletedAt: null, status: { not: "healthy" } },
        select: { toothNumber: true, status: true, lastTreatedAt: true },
        orderBy: { toothNumber: "asc" },
      }),
      db.pdfRecord.count(),
    ]);

    const notesText = [patient.anamnesis, patient.notes].filter(Boolean).join("\n");
    const pdf = await renderTreatmentSummaryPdf({
      docNumber: formatDocumentNumber(count + 1),
      createdAt: new Date(),
      clinic,
      patient: {
        fullName: `${patient.lastName} ${patient.firstName}${patient.fatherName ? ` ${patient.fatherName}` : ""}`,
        phone: patient.phone ?? patient.guardian?.phone,
        birthDate: patient.birthDate,
        age: calcAge(patient.birthDate),
        genderLabel: patient.gender ? (patient.gender === "male" ? "Kişi" : "Qadın") : null,
        allergies: patient.allergies,
        guardian: patient.guardian
          ? {
              fullName: `${patient.guardian.lastName} ${patient.guardian.firstName}`,
              phone: patient.guardian.phone,
            }
          : null,
        doctorName: patient.primaryDoctor?.user.fullName ?? null,
      },
      items: items.map((i) => ({
        performedAt: i.performedAt,
        tooth: i.toothNumber,
        service: i.service.name,
        statusLabel: TREATMENT_ITEM_STATUS_META[i.status]?.az ?? i.status,
        doctorName: i.doctor.user.fullName,
        notes: i.notes?.startsWith("demo-seed") ? null : i.notes,
        price: i.price - i.discount,
      })),
      teeth: teeth.map((t) => ({
        number: t.toothNumber,
        statusLabel: TOOTH_STATUS_META[t.status]?.az ?? t.status,
        lastTreatedAt: t.lastTreatedAt,
      })),
      recommendations: notesText || DEFAULT_RECOMMENDATIONS,
    });

    const fileUrl = `documents/${clinicId}/${patient.id}/${newFileName("mualice-cixarisi")}`;
    await saveUploadFile(fileUrl, pdf);

    const record = await db.pdfRecord.create({
      data: {
        patientId: patient.id,
        type: "extract",
        sourceEntity: "patient",
        sourceId: patient.id,
        fileUrl,
        generatedById: user.id,
      },
    } as never);
    recordId = (record as { id: string }).id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "pdf_record",
        entityId: recordId,
        after: { type: "extract", patientId: patient.id, fileUrl },
      },
    } as never);
  } catch (e) {
    console.error("generateTreatmentSummary failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}`);
  revalidatePath(`/patients/${patient.id}/documents`);
  revalidatePath("/documents");
  redirect(`/documents/${recordId}`);
}

export async function generateInvoicePdf(
  _prev: DocumentFormState | undefined,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requirePermission("documents.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = invoicePdfSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "invoiceNotFound" };

  // счёт — только из scope (tenant + роль через пациента)
  const invoice = await getInvoiceForUser(user, parsed.data.invoiceId);
  if (!invoice) return { error: "invoiceNotFound" };

  let recordId: string;
  try {
    const db = tenantClient(clinicId);
    const [clinic, receiverNames, count] = await Promise.all([
      clinicInfo(clinicId),
      paymentReceiverNames(user, invoice.payments.map((p) => p.receivedById)),
      db.pdfRecord.count(),
    ]);

    const pdf = await renderInvoicePdf({
      docNumber: formatDocumentNumber(count + 1),
      createdAt: new Date(),
      clinic,
      invoice: {
        number: formatInvoiceNumber(invoice.number),
        issuedAt: invoice.createdAt,
        statusLabel: INVOICE_STATUS_META[invoice.status]?.az ?? invoice.status,
      },
      patient: {
        fullName: `${invoice.patient.lastName} ${invoice.patient.firstName}`,
        phone: invoice.patient.phone,
      },
      items: invoice.items.map((i) => ({
        description: i.description,
        qty: i.qty,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      totals: {
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        total: invoice.total,
        paid: invoice.paidAmount,
        balance: invoice.total - invoice.paidAmount,
      },
      payments: invoice.payments.map((p) => ({
        paidAt: p.paidAt,
        methodLabel: PAYMENT_METHOD_META[p.method]?.az ?? p.method,
        amount: p.amount,
        receivedBy: receiverNames.get(p.receivedById) ?? "—",
      })),
    });

    const fileUrl = `documents/${clinicId}/${invoice.patient.id}/${newFileName("hesab")}`;
    await saveUploadFile(fileUrl, pdf);

    const record = await db.pdfRecord.create({
      data: {
        patientId: invoice.patient.id,
        type: "invoice_pdf",
        sourceEntity: "invoice",
        sourceId: invoice.id,
        fileUrl,
        generatedById: user.id,
      },
    } as never);
    recordId = (record as { id: string }).id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "pdf_record",
        entityId: recordId,
        after: { type: "invoice_pdf", invoiceId: invoice.id, fileUrl },
      },
    } as never);
  } catch (e) {
    console.error("generateInvoicePdf failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/finance/invoices/${invoice.id}`);
  revalidatePath(`/patients/${invoice.patient.id}`);
  revalidatePath(`/patients/${invoice.patient.id}/documents`);
  revalidatePath("/documents");
  redirect(`/documents/${recordId}`);
}

/**
 * Загрузка файла пациента (сессия 14). Файл валидируется по магическим
 * байтам (клиентскому mime/имени не доверяем), имя на диске генерируется
 * сервером, оригинальное имя — только как заголовок (sanitized).
 */
export async function uploadPatientDocument(
  _prev: DocumentFormState | undefined,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requirePermission("documents.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = uploadDocumentSchema.safeParse({
    patientId: formData.get("patientId"),
    type: formData.get("type"),
    title: formData.get("title"),
  });
  if (!parsed.success) return { error: "patientNotFound" };
  const input = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "fileRequired" };
  if (file.size > UPLOAD_MAX_BYTES) return { error: "fileTooLarge" };

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { error: "patientNotFound" };

  let documentId: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > UPLOAD_MAX_BYTES) return { error: "fileTooLarge" };

    // mime — по содержимому, не по заголовку клиента
    const mime = sniffUploadMime(bytes);
    if (!mime || !UPLOAD_MIME_EXT[mime]) return { error: "unsupportedType" };

    const fileName = newFileName(input.type, UPLOAD_MIME_EXT[mime]);
    const fileUrl = `documents/${clinicId}/${patient.id}/uploaded/${fileName}`;
    const title = input.title ?? sanitizeOriginalName(file.name ?? "", fileName);

    await saveUploadFile(fileUrl, bytes);

    const db = tenantClient(clinicId);
    const record = await db.document.create({
      data: {
        patientId: patient.id,
        type: input.type,
        title,
        fileUrl,
        mimeType: mime,
        fileSize: bytes.length,
        uploadedById: user.id,
      },
    } as never);
    documentId = (record as { id: string }).id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "document",
        entityId: documentId,
        after: { type: input.type, patientId: patient.id, fileUrl, mimeType: mime, fileSize: bytes.length },
      },
    } as never);
  } catch (e) {
    console.error("uploadPatientDocument failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${patient.id}`);
  revalidatePath(`/patients/${patient.id}/documents`);
  revalidatePath("/documents");
  return { uploadedId: documentId };
}

/**
 * Soft-delete загруженного документа (сессия 14.5): только deletedAt,
 * физический файл в v1 остаётся на диске. pdf_records этим action
 * не удаляются (append-only). Повторное удаление — идемпотентно.
 */
export async function deleteUploadedDocument(
  _prev: DocumentFormState | undefined,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requirePermission("documents.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = deleteDocumentSchema.safeParse({ documentId: formData.get("documentId") });
  if (!parsed.success) return { error: "notFound" };

  try {
    const db = tenantClient(clinicId);
    // tenant + ролевой scope по пациенту; БЕЗ фильтра deletedAt —
    // повторное удаление должно быть идемпотентным, а не «не найдено»
    const scope = await patientScopeWhere(user);
    const doc = await db.document.findFirst({
      where: {
        AND: [
          { id: parsed.data.documentId },
          Object.keys(scope).length ? { patient: scope } : {},
        ],
      },
      select: { id: true, patientId: true, deletedAt: true, title: true, fileUrl: true },
    });
    if (!doc) return { error: "notFound" }; // чужой/несуществующий — без утечки
    if (doc.deletedAt) return { deleted: true }; // уже удалён — безопасный результат

    await prisma.document.update({
      where: { id: doc.id },
      data: { deletedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "delete",
        entityType: "document",
        entityId: doc.id,
        before: { title: doc.title, fileUrl: doc.fileUrl, patientId: doc.patientId },
      },
    } as never);

    if (doc.patientId) {
      revalidatePath(`/patients/${doc.patientId}`);
      revalidatePath(`/patients/${doc.patientId}/documents`);
    }
    revalidatePath("/documents");
  } catch (e) {
    console.error("deleteUploadedDocument failed:", e);
    return { error: "deleteFailed" };
  }

  return { deleted: true };
}
