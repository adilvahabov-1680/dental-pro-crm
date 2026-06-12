"use server";

/**
 * Server actions модуля Maliyyə.
 * Нумерация счетов и оплаты — в интерактивных транзакциях с
 * pg_advisory_xact_lock (закрывает риск гонки из DATABASE.md §9.2);
 * unique(clinic_id, number) — страховка. Внутри транзакций используется
 * базовый prisma-клиент, clinic_id проставляется явно (tenant-фильтр
 * подтверждён выборками до записи).
 * Payment — append-only: не редактируется и не удаляется.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { getInvoiceForUser } from "@/lib/finance";
import {
  invoiceCreateSchema,
  paymentSchema,
  type FinanceFormState,
} from "@/lib/validation/finance";
import { issuesToFieldErrors } from "@/lib/validation/patients";

class FinanceError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

export async function createInvoice(
  _prev: FinanceFormState | undefined,
  formData: FormData,
): Promise<FinanceFormState> {
  const user = await requirePermission("finance.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = invoiceCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const { patientId, notes } = parsed.data;

  const itemIds = formData
    .getAll("itemIds")
    .map(String)
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (itemIds.length === 0) return { error: "itemsRequired" };

  // пациент — только из scope (tenant + роль)
  const patient = await getPatientForUser(user, patientId);
  if (!patient) return { fieldErrors: { patientId: "patientRequired" } };

  let invoiceId: string;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      // сериализация нумерации per clinic (::text — lock возвращает void, Prisma его не читает)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"invoice:" + clinicId}))::text`;

      // form input не доверяем: только done, без счёта, этого пациента и клиники
      const items = await tx.treatmentItem.findMany({
        where: {
          id: { in: itemIds },
          clinicId,
          patientId: patient.id,
          status: "done",
          invoiceId: null,
          deletedAt: null,
        },
        include: { service: { select: { name: true } } },
      });
      if (items.length !== itemIds.length) throw new FinanceError("itemsInvalid");

      const max = await tx.invoice.aggregate({ where: { clinicId }, _max: { number: true } });
      const number = (max._max.number ?? 0) + 1;

      const subtotal = items.reduce((s, i) => s + i.price - i.discount, 0);
      const doctorIds = new Set(items.map((i) => i.doctorId));
      const invoice = await tx.invoice.create({
        data: {
          clinicId,
          patientId: patient.id,
          doctorId: doctorIds.size === 1 ? items[0].doctorId : null,
          number,
          status: "issued",
          subtotal,
          discount: 0,
          total: subtotal,
          paidAmount: 0,
          notes,
        },
      });

      await tx.invoiceItem.createMany({
        data: items.map((i) => ({
          clinicId,
          invoiceId: invoice.id,
          treatmentItemId: i.id,
          description: `${i.service.name}${i.toothNumber ? ` · Diş ${i.toothNumber}` : ""}`,
          qty: 1,
          unitPrice: i.price - i.discount,
          total: i.price - i.discount,
        })),
      });

      await tx.treatmentItem.updateMany({
        where: { id: { in: items.map((i) => i.id) }, clinicId },
        data: { invoiceId: invoice.id },
      });

      // per-invoice debt-кэш (DATABASE.md §F.21)
      await tx.debt.create({
        data: {
          clinicId,
          patientId: patient.id,
          invoiceId: invoice.id,
          amount: subtotal,
          status: "open",
        },
      });

      return invoice.id;
    });

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "invoice",
        entityId: invoiceId,
        after: { patientId: patient.id, items: itemIds.length },
      },
    } as never);
  } catch (e) {
    if (e instanceof FinanceError) return { error: e.key };
    console.error("createInvoice failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/finance");
  revalidatePath(`/patients/${patient.id}`);
  revalidatePath(`/patients/${patient.id}/finance`);
  revalidatePath(`/patients/${patient.id}/treatments`);
  redirect(`/finance/invoices/${invoiceId}`);
}

export async function addPayment(
  _prev: FinanceFormState | undefined,
  formData: FormData,
): Promise<FinanceFormState> {
  const user = await requirePermission("finance.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  // scope-проверка до транзакции (чужой счёт → notFound)
  const scoped = await getInvoiceForUser(user, input.invoiceId);
  if (!scoped) return { error: "invoiceNotFound" };

  try {
    await prisma.$transaction(async (tx) => {
      // сериализация параллельных оплат по счёту (::text — см. выше)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"payment:" + input.invoiceId}))::text`;

      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, clinicId, deletedAt: null },
      });
      if (!invoice) throw new FinanceError("invoiceNotFound");
      if (invoice.status === "cancelled" || invoice.status === "draft") {
        throw new FinanceError("invoiceClosed");
      }
      const balance = invoice.total - invoice.paidAmount;
      // v1: переплата запрещена
      if (input.amount > balance) throw new FinanceError("amountExceeds");

      await tx.payment.create({
        data: {
          clinicId,
          patientId: invoice.patientId,
          invoiceId: invoice.id,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          receivedById: user.id,
          notes: input.note,
        },
      });

      const paidAmount = invoice.paidAmount + input.amount;
      const fullyPaid = paidAmount >= invoice.total;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount, status: fullyPaid ? "paid" : "partially_paid" },
      });
      await tx.debt.updateMany({
        where: { invoiceId: invoice.id, clinicId },
        data: {
          amount: invoice.total - paidAmount,
          status: fullyPaid ? "closed" : "partial",
        },
      });
    });

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "payment",
        entityId: input.invoiceId,
        after: { amount: input.amount, method: input.method },
      },
    } as never);
  } catch (e) {
    if (e instanceof FinanceError) return { error: e.key };
    console.error("addPayment failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/finance/invoices/${input.invoiceId}`);
  revalidatePath("/finance");
  revalidatePath(`/patients/${scoped.patient.id}`);
  revalidatePath(`/patients/${scoped.patient.id}/finance`);
  return {};
}

/**
 * Отмена счёта (v1): только без оплат. Счёт не удаляется (status=cancelled),
 * invoice_items остаются как исторические строки, payments не трогаются
 * (append-only), процедуры отвязываются и снова доступны для счёта,
 * debt списывается (written_off). Lock тот же, что у addPayment, —
 * закрывает гонку «оплата во время отмены».
 */
export async function cancelInvoice(
  _prev: FinanceFormState | undefined,
  formData: FormData,
): Promise<FinanceFormState> {
  const user = await requirePermission("finance.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return { error: "invoiceNotFound" };

  // scope-проверка до транзакции (чужой счёт → notFound)
  const scoped = await getInvoiceForUser(user, invoiceId);
  if (!scoped) return { error: "invoiceNotFound" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"payment:" + invoiceId}))::text`;

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, clinicId, deletedAt: null },
        include: { _count: { select: { payments: true } } },
      });
      if (!invoice) throw new FinanceError("invoiceNotFound");
      if (invoice.status === "cancelled") throw new FinanceError("cancelNotAllowed");
      // v1: любой счёт с оплатой не отменяется (геri ödəniş модуля ещё нет)
      if (invoice.status === "paid" || invoice.paidAmount > 0 || invoice._count.payments > 0) {
        throw new FinanceError("cancelHasPayments");
      }

      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "cancelled" } });
      await tx.debt.updateMany({
        where: { invoiceId: invoice.id, clinicId },
        data: { amount: 0, status: "written_off" },
      });
      await tx.treatmentItem.updateMany({
        where: { invoiceId: invoice.id, clinicId },
        data: { invoiceId: null },
      });
    });

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "invoice",
        entityId: invoiceId,
        before: { status: scoped.status },
        after: { status: "cancelled" },
      },
    } as never);
  } catch (e) {
    if (e instanceof FinanceError) return { error: e.key };
    console.error("cancelInvoice failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/finance/invoices/${invoiceId}`);
  revalidatePath("/finance");
  revalidatePath(`/patients/${scoped.patient.id}`);
  revalidatePath(`/patients/${scoped.patient.id}/finance`);
  revalidatePath(`/patients/${scoped.patient.id}/treatments`);
  return {};
}
