/**
 * Multi-tenant security foundation — см. docs/DATABASE.md §3.
 * Правило №1: ни одного бизнес-запроса без tenant-фильтра.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import type { SessionUser } from "@/types/auth";
import type { TenantFilter } from "@/types/tenant";

/** clinic_id текущего пользователя (null — super_admin). */
export async function getCurrentTenant(): Promise<string | null> {
  const user = await requireAuth();
  return user.clinicId;
}

/** Может ли пользователь видеть данные клиники clinicId. */
export function canAccessClinic(user: SessionUser, clinicId: string): boolean {
  if (user.role === "super_admin") return true;
  return user.clinicId === clinicId;
}

/**
 * Может ли пользователь видеть данные врача doctorId (внутри своей клиники).
 * doctor — только свои; assistant — только прикреплённого врача;
 * owner/admin/reception/accountant — всех врачей клиники.
 */
export function canAccessDoctorData(user: SessionUser, doctorId: string): boolean {
  switch (user.role) {
    case "super_admin":
      return false; // мед. данные клиник super_admin не читает
    case "doctor":
      return user.doctorId === doctorId;
    case "assistant":
      return user.assignedDoctorId === doctorId;
    default:
      return true; // owner/admin/reception/accountant — в пределах клиники
  }
}

/** where-фильтр тенанта: {} только для super_admin. */
export function getTenantFilter(user: SessionUser): TenantFilter {
  if (user.role === "super_admin") return {};
  if (!user.clinicId) throw new Error("Session without clinicId");
  return { clinicId: user.clinicId };
}

/** Prisma-модели с колонкой clinic_id (бизнес-данные). */
const TENANT_MODELS = new Set<string>([
  "Doctor",
  "Assistant",
  "Patient",
  "Appointment",
  "DentalChart",
  "ToothRecord",
  "ToothHistory",
  "TreatmentPlan",
  "TreatmentItem",
  "TreatmentItemMaterial",
  "TreatmentProtocol",
  "TreatmentProtocolStep",
  "ServiceCategory",
  "Service",
  "Price",
  "Invoice",
  "InvoiceItem",
  "Payment",
  "Debt",
  "InventoryCategory",
  "InventoryItem",
  "InventoryMovement",
  "Supplier",
  "SupplierOrder",
  "SupplierOrderItem",
  "SupplierCatalogItem",
  "Document",
  "PdfRecord",
  "Notification",
  "PatientResponseLink",
  "Setting",
  "Translation",
  "AuditLog",
]);

const FILTERED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/**
 * Tenant-aware Prisma client: автоматически добавляет clinicId
 * в where (findMany/findFirst/count/aggregate/updateMany/deleteMany)
 * и в data (create/createMany).
 *
 * ВАЖНО (см. DEVELOPMENT_RULES.md):
 *  - findUnique/update/delete по id НЕ фильтруются автоматически —
 *    для точечных операций использовать findFirst({ where: { id, ... } })
 *    через этот клиент, либо проверять принадлежность записи вручную;
 *  - super_admin работает через prisma напрямую только в /admin-коде.
 */
export function tenantClient(clinicId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);

          /* eslint-disable @typescript-eslint/no-explicit-any */
          const a = args as any;
          if (FILTERED_OPS.has(operation)) {
            a.where = { AND: [a.where ?? {}, { clinicId }] };
          } else if (operation === "create") {
            a.data = { ...a.data, clinicId };
          } else if (operation === "createMany") {
            const data = Array.isArray(a.data) ? a.data : [a.data];
            a.data = data.map((d: Record<string, unknown>) => ({ ...d, clinicId }));
          }
          /* eslint-enable @typescript-eslint/no-explicit-any */
          return query(args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof tenantClient>;

// ─────────────────────────────────────────────────────────────
// Safe-хелперы точечных операций (закрывают риск из сессии 3:
// findUnique/update/delete по голому id обходят tenant-фильтр).
// Паттерн: сначала tenant-фильтрованный findFirst подтверждает
// принадлежность записи клинике, затем выполняется операция.
// Race check-then-act здесь приемлем: id — UUID, запись не может
// «сменить клинику» между проверкой и операцией (clinic_id не мутируется).
// ─────────────────────────────────────────────────────────────

export class TenantAccessError extends Error {
  constructor(model: string, id: string) {
    super(`Tenant access denied or record not found: ${model}#${id}`);
    this.name = "TenantAccessError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PointDelegate {
  findFirst(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

/**
 * Точечное чтение по id ВМЕСТО findUnique.
 * delegate — модель из tenantClient (напр. db.patient): findFirst уже
 * tenant-фильтрован, поэтому чужая запись вернёт null.
 */
export async function safeFindFirstByTenant<T extends PointDelegate>(
  delegate: T,
  id: string,
  args?: Omit<Parameters<T["findFirst"]>[0], "where">,
): Promise<Awaited<ReturnType<T["findFirst"]>> | null> {
  return delegate.findFirst({ ...(args ?? {}), where: { id } });
}

/** Точечный update по id с проверкой принадлежности тенанту. */
export async function safeUpdateByTenant<T extends PointDelegate>(
  delegate: T,
  modelName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Awaited<ReturnType<T["update"]>>> {
  const owned = await delegate.findFirst({ where: { id }, select: { id: true } });
  if (!owned) throw new TenantAccessError(modelName, id);
  return delegate.update({ where: { id }, data });
}

/**
 * Точечное удаление по id с проверкой принадлежности тенанту.
 * ВАЖНО: для моделей с deleted_at предпочитать soft delete —
 * safeUpdateByTenant(delegate, model, id, { deletedAt: new Date() }).
 * Жёсткий delete — только там, где soft delete не предусмотрен.
 */
export async function safeDeleteByTenant<T extends PointDelegate>(
  delegate: T,
  modelName: string,
  id: string,
): Promise<Awaited<ReturnType<T["delete"]>>> {
  const owned = await delegate.findFirst({ where: { id }, select: { id: true } });
  if (!owned) throw new TenantAccessError(modelName, id);
  return delegate.delete({ where: { id } });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Удобный шорткат: tenant-клиент текущего пользователя. */
export async function db(): Promise<TenantClient> {
  const user = await requireAuth();
  if (user.role === "super_admin" || !user.clinicId) {
    throw new Error("super_admin must use prisma directly in /admin code");
  }
  return tenantClient(user.clinicId);
}

export { Prisma };
