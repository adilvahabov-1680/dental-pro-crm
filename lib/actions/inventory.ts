"use server";

/**
 * Server actions модуля Anbar.
 * Остаток пересчитывается в интерактивных транзакциях с advisory lock
 * по материалу (::text — урок сессии 9: lock возвращает void).
 * Отрицательный склад запрещён. Движения append-only.
 * Low-stock notification создаётся ТОЛЬКО при переходе normal→low/out
 * (без спама). Списание на процедуру = treatments.manage (действие врача);
 * CRUD склада = inventory.manage.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getTreatmentItemForUser } from "@/lib/treatments";
import {
  inventoryItemSchema,
  movementSchema,
  treatmentMaterialSchema,
  type InventoryFormState,
} from "@/lib/validation/inventory";
import { issuesToFieldErrors } from "@/lib/validation/patients";

class InventoryError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Применить движение к материалу внутри транзакции (lock уже взят). */
async function applyMovement(
  tx: Tx,
  clinicId: string,
  userId: string,
  itemId: string,
  type: "in_stock" | "out_stock" | "adjustment" | "adjustment_out" | "write_off",
  quantity: number,
  reason: string | null,
  treatmentItemId: string | null = null,
): Promise<{ wasLow: boolean; isLow: boolean; itemName: string }> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: itemId, clinicId, deletedAt: null },
  });
  if (!item) throw new InventoryError("itemNotFound");

  const prev = Number(item.quantity);
  const min = Number(item.minQuantity);
  const isIncoming = type === "in_stock" || type === "adjustment";
  const delta = isIncoming ? quantity : -quantity;
  const next = Math.round((prev + delta) * 1000) / 1000;
  if (next < 0) throw new InventoryError("insufficientStock");

  await tx.inventoryMovement.create({
    data: {
      clinicId,
      inventoryItemId: item.id,
      type,
      quantity,
      unitCost: item.unitCost,
      reason,
      treatmentItemId,
      performedById: userId,
    },
  });
  await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: next } });

  return { wasLow: prev <= min, isLow: next <= min, itemName: item.name };
}

/** Notification при переходе normal→low (вне tx, не критично для консистентности). */
async function notifyLowStock(
  clinicId: string,
  itemName: string,
  transition: { wasLow: boolean; isLow: boolean },
) {
  if (transition.wasLow || !transition.isLow) return; // только переход
  await prisma.notification.create({
    data: {
      clinicId,
      channel: "in_app",
      type: "inventory_low_stock",
      body: `Material az qalıb: ${itemName}`,
      scheduledAt: new Date(),
    },
  });
}

export async function createInventoryItem(
  _prev: InventoryFormState | undefined,
  formData: FormData,
): Promise<InventoryFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = inventoryItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(clinicId);
  let itemId: string;
  try {
    // категория — только своей клиники
    if (input.categoryId) {
      const cat = await db.inventoryCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!cat) input.categoryId = null;
    }
    // supplier: find-or-create по имени (основа будущих заказов поставщику)
    let supplierId: string | null = null;
    if (input.supplierName) {
      const existing = await db.supplier.findFirst({
        where: { name: input.supplierName, deletedAt: null },
        select: { id: true },
      });
      supplierId = existing
        ? existing.id
        : ((await db.supplier.create({ data: { name: input.supplierName } } as never)) as { id: string }).id;
    }

    itemId = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          clinicId,
          name: input.name,
          categoryId: input.categoryId,
          unit: input.unit,
          quantity: input.initialQuantity,
          minQuantity: input.minQuantity,
          unitCost: input.purchasePrice,
          supplierId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      if (input.initialQuantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            clinicId,
            inventoryItemId: item.id,
            type: "in_stock",
            quantity: input.initialQuantity,
            unitCost: input.purchasePrice,
            reason: "İlkin qalıq",
            performedById: user.id,
          },
        });
      }
      return item.id;
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "inventory_item",
        entityId: itemId,
        after: { name: input.name, quantity: input.initialQuantity },
      },
    } as never);
  } catch (e) {
    if (e instanceof InventoryError) return { error: e.key };
    console.error("createInventoryItem failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/inventory");
  redirect(`/inventory/${itemId}`);
}

export async function addInventoryMovement(
  _prev: InventoryFormState | undefined,
  formData: FormData,
): Promise<InventoryFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = movementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  try {
    const transition = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"inv:" + input.inventoryItemId}))::text`;
      return applyMovement(
        tx,
        clinicId,
        user.id,
        input.inventoryItemId,
        input.type,
        input.quantity,
        input.reason,
      );
    });
    await notifyLowStock(clinicId, transition.itemName, transition);

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "inventory_movement",
        entityId: input.inventoryItemId,
        after: { type: input.type, quantity: input.quantity },
      },
    } as never);
  } catch (e) {
    if (e instanceof InventoryError) return { error: e.key };
    console.error("addInventoryMovement failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/${input.inventoryItemId}`);
  revalidatePath("/inventory");
  return {};
}

export async function addTreatmentMaterial(
  _prev: InventoryFormState | undefined,
  formData: FormData,
): Promise<InventoryFormState> {
  // списание на процедуру — медицинское действие врача
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = treatmentMaterialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  // процедура — в scope пользователя (tenant + роль через пациента)
  const treatment = await getTreatmentItemForUser(user, input.treatmentItemId);
  if (!treatment) return { error: "treatmentNotFound" };
  if (treatment.status === "cancelled") return { error: "treatmentCancelled" };

  try {
    const transition = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"inv:" + input.inventoryItemId}))::text`;
      const item = await tx.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, clinicId, deletedAt: null },
        select: { id: true, unitCost: true },
      });
      if (!item) throw new InventoryError("itemNotFound");

      const result = await applyMovement(
        tx,
        clinicId,
        user.id,
        input.inventoryItemId,
        "out_stock",
        input.quantity,
        "Müalicədə istifadə",
        treatment.id,
      );
      // повторное добавление того же материала — отдельной строкой (v1)
      await tx.treatmentItemMaterial.create({
        data: {
          clinicId,
          treatmentItemId: treatment.id,
          inventoryItemId: item.id,
          quantity: input.quantity,
          unitCost: item.unitCost ?? 0,
        },
      });
      return result;
    });
    await notifyLowStock(clinicId, transition.itemName, transition);

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "treatment_item_material",
        entityId: treatment.id,
        after: { inventoryItemId: input.inventoryItemId, quantity: input.quantity },
      },
    } as never);
  } catch (e) {
    if (e instanceof InventoryError) return { error: e.key };
    console.error("addTreatmentMaterial failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/treatments/${treatment.id}/materials`);
  revalidatePath(`/patients/${treatment.patientId}/treatments`);
  revalidatePath("/inventory");
  return {};
}
