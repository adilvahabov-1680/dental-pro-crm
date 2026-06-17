/**
 * Supplier catalog data access (server-only).
 * This is an external price list — NOT linked to InventoryItem in v1.
 * Permissions: inventory.view (read), inventory.manage (write).
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import type { SessionUser } from "@/types/auth";

const supplierSelect = {
  id: true,
  name: true,
  contactName: true,
  phone: true,
  whatsapp: true,
  email: true,
  address: true,
  notes: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.SupplierSelect;

export type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof supplierSelect }>;

const catalogItemSelect = {
  id: true,
  supplierId: true,
  sku: true,
  name: true,
  category: true,
  brand: true,
  unit: true,
  price: true,
  currency: true,
  minOrderQty: true,
  availability: true,
  isActive: true,
  importedAt: true,
  sourceRow: true,
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.SupplierCatalogItemSelect;

export type CatalogItemRow = Prisma.SupplierCatalogItemGetPayload<{
  select: typeof catalogItemSelect;
}>;

export interface CatalogFilters {
  q?: string;
  category?: string;
  activeOnly?: boolean;
}

export async function listSuppliers(user: SessionUser): Promise<SupplierRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.supplier.findMany({
    where: { deletedAt: null, isActive: true },
    select: supplierSelect,
    orderBy: { name: "asc" },
  });
}

export async function getSupplierForUser(
  user: SessionUser,
  id: string,
): Promise<SupplierRow | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  return db.supplier.findFirst({
    where: { id, deletedAt: null },
    select: supplierSelect,
  });
}

export async function listCatalogItems(
  user: SessionUser,
  supplierId: string,
  filters: CatalogFilters = {},
): Promise<CatalogItemRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const and: Prisma.SupplierCatalogItemWhereInput[] = [
    { supplierId, deletedAt: null },
  ];
  if (filters.activeOnly !== false) and.push({ isActive: true });
  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.category) and.push({ category: filters.category });
  return db.supplierCatalogItem.findMany({
    where: { AND: and },
    select: catalogItemSelect,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 500,
  });
}

/** Distinct categories for a supplier's catalog (for filter dropdown). */
export async function listCatalogCategories(
  user: SessionUser,
  supplierId: string,
): Promise<string[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.supplierCatalogItem.findMany({
    where: { supplierId, deletedAt: null, isActive: true, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category!).filter(Boolean);
}

export function formatPrice(price: Prisma.Decimal | number, currency = "AZN"): string {
  return `${Number(price).toFixed(2)} ${currency}`;
}
