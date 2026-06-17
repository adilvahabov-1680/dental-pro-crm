"use server";

/**
 * Server actions for the supplier catalog module.
 * Permissions: inventory.manage for all mutations.
 * Excel import: server-side buffer parse, max 1000 rows, no disk writes.
 * Upsert key: supplierId+sku (if sku present) or supplierId+normalizedName.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { issuesToFieldErrors } from "@/lib/validation/patients";
import {
  supplierSchema,
  supplierIdSchema,
  catalogItemIdSchema,
  type SupplierFormState,
  type CatalogImportState,
} from "@/lib/validation/suppliers";

class SupplierError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

// ── Supplier CRUD ────────────────────────────────────────────────────────────

export async function createSupplier(
  _prev: SupplierFormState | undefined,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(user.clinicId);
  let supplierId: string;
  try {
    const existing = await db.supplier.findFirst({
      where: { name: input.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) return { error: "nameTaken" };

    const supplier = await db.supplier.create({
      data: {
        name: input.name,
        contactName: input.contactName,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        address: input.address,
        notes: input.notes,
      },
    } as never);
    supplierId = (supplier as { id: string }).id;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "supplier",
        entityId: supplierId,
        after: { name: input.name },
      },
    } as never);
  } catch (e) {
    if (e instanceof SupplierError) return { error: e.key };
    console.error("createSupplier failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/inventory/suppliers");
  redirect(`/inventory/suppliers/${supplierId}`);
}

export async function updateSupplier(
  _prev: SupplierFormState | undefined,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const supplierId = formData.get("supplierId") as string;
  if (!supplierId) return { error: "generic" };

  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const existing = await db.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { error: "notFound" };

    const nameTaken = await db.supplier.findFirst({
      where: { name: input.name, deletedAt: null, id: { not: supplierId } },
      select: { id: true },
    });
    if (nameTaken) return { error: "nameTaken" };

    await db.supplier.update({
      where: { id: supplierId },
      data: {
        name: input.name,
        contactName: input.contactName,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        address: input.address,
        notes: input.notes,
      },
    } as never);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "supplier",
        entityId: supplierId,
        after: { name: input.name },
      },
    } as never);
  } catch (e) {
    console.error("updateSupplier failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/suppliers/${supplierId}`);
  revalidatePath("/inventory/suppliers");
  return { supplierId };
}

export async function deactivateSupplier(
  _prev: SupplierFormState | undefined,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = supplierIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };

  const db = tenantClient(user.clinicId);
  try {
    const existing = await db.supplier.findFirst({
      where: { id: parsed.data.supplierId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { error: "notFound" };

    await db.supplier.update({
      where: { id: parsed.data.supplierId },
      data: { isActive: false },
    } as never);
  } catch (e) {
    console.error("deactivateSupplier failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/inventory/suppliers");
  redirect("/inventory/suppliers");
}

// ── Catalog item ─────────────────────────────────────────────────────────────

export async function deactivateSupplierCatalogItem(
  _prev: SupplierFormState | undefined,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = catalogItemIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const { catalogItemId } = parsed.data;

  const db = tenantClient(user.clinicId);
  try {
    const item = await db.supplierCatalogItem.findFirst({
      where: { id: catalogItemId, deletedAt: null },
      select: { id: true, supplierId: true },
    });
    if (!item) return { error: "notFound" };

    await db.supplierCatalogItem.update({
      where: { id: catalogItemId },
      data: { isActive: false },
    } as never);

    revalidatePath(`/inventory/suppliers/${item.supplierId}`);
  } catch (e) {
    console.error("deactivateSupplierCatalogItem failed:", e);
    return { error: "generic" };
  }

  return {};
}

// ── Excel import ─────────────────────────────────────────────────────────────

/** Normalize a column header for matching against known aliases. */
function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s_\-\.]+/g, "");
}

/** Normalize item name for upsert key (no-sku path). */
function normalizeName(n: string): string {
  return n.toLowerCase().trim().replace(/\s+/g, " ");
}

const HEADER_ALIASES: Record<string, string> = {
  // name
  ad: "name",
  adı: "name",
  name: "name",
  məhsulun: "name",
  məhsul: "name",
  наименование: "name",
  название: "name",
  товар: "name",
  // sku
  sku: "sku",
  kod: "sku",
  kod1c: "sku",
  artikul: "sku",
  артикул: "sku",
  код: "sku",
  // price
  qiymət: "price",
  qiymet: "price",
  price: "price",
  цена: "price",
  // category
  kateqoriya: "category",
  category: "category",
  категория: "category",
  // brand
  brend: "brand",
  brand: "brand",
  марка: "brand",
  бренд: "brand",
  // unit
  vahid: "unit",
  unit: "unit",
  единица: "unit",
  ед: "unit",
  // minOrderQty
  minmiqdar: "minOrderQty",
  minorder: "minOrderQty",
  minsipariş: "minOrderQty",
  minzakaz: "minOrderQty",
  минзаказ: "minOrderQty",
  // availability
  mövcudluq: "availability",
  availability: "availability",
  наличие: "availability",
};

function mapHeaders(row: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((h, i) => {
    const norm = normalizeHeader(h);
    const key = HEADER_ALIASES[norm];
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}

function cellString(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

function cellDecimal(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

export async function importSupplierCatalogExcel(
  supplierId: string,
  formData: FormData,
): Promise<CatalogImportState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  // Verify supplier belongs to this clinic
  const db = tenantClient(clinicId);
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) return { error: "supplierNotFound" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "noFile" };
  if (!file.name.match(/\.(xlsx|xls)$/i)) return { error: "invalidFileType" };
  if (file.size > 10 * 1024 * 1024) return { error: "fileTooLarge" };

  let rows: unknown[][];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  } catch {
    return { error: "parseError" };
  }

  if (rows.length < 2) return { error: "emptyFile" };

  const headers = mapHeaders(rows[0]);
  if (headers.name === undefined) return { error: "missingNameColumn" };
  if (headers.price === undefined) return { error: "missingPriceColumn" };

  const dataRows = rows.slice(1, 1001); // max 1000 rows
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const name = cellString(row, headers.name);
    const price = cellDecimal(row, headers.price);
    if (!name || !price) { skipped++; continue; }

    const sku = cellString(row, headers.sku);
    const category = cellString(row, headers.category);
    const brand = cellString(row, headers.brand);
    const unit = cellString(row, headers.unit);
    const minOrderQty = cellDecimal(row, headers.minOrderQty);
    const availability = cellString(row, headers.availability);
    const sourceRow = i + 2; // 1-indexed, account for header row

    const data = {
      name,
      sku,
      category,
      brand,
      unit,
      price,
      minOrderQty,
      availability,
      sourceRow,
      isActive: true,
      importedAt: new Date(),
    };

    try {
      if (sku) {
        // Upsert by supplierId + sku
        const existing = await db.supplierCatalogItem.findFirst({
          where: { supplierId, sku, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          await db.supplierCatalogItem.update({
            where: { id: existing.id },
            data,
          } as never);
          updated++;
        } else {
          await db.supplierCatalogItem.create({
            data: { supplierId, ...data },
          } as never);
          inserted++;
        }
      } else {
        // Upsert by supplierId + normalizedName
        const normalized = normalizeName(name);
        const existing = await db.supplierCatalogItem.findFirst({
          where: { supplierId, deletedAt: null },
          select: { id: true, name: true },
        });
        // find by normalized name match
        const allForSupplier = await db.supplierCatalogItem.findMany({
          where: { supplierId, sku: null, deletedAt: null },
          select: { id: true, name: true },
        });
        const match = allForSupplier.find((r) => normalizeName(r.name) === normalized);
        void existing; // suppress lint
        if (match) {
          await db.supplierCatalogItem.update({
            where: { id: match.id },
            data,
          } as never);
          updated++;
        } else {
          await db.supplierCatalogItem.create({
            data: { supplierId, ...data },
          } as never);
          inserted++;
        }
      }
    } catch {
      skipped++;
    }
  }

  revalidatePath(`/inventory/suppliers/${supplierId}`);
  return { inserted, updated, skipped };
}
