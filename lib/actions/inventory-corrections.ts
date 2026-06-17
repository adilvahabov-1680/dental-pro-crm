"use server";

/**
 * Server action для ручных корректировок склада (сессия 31).
 * Каждое изменение quantity создаёт InventoryMovement (audit trail).
 * Отрицательный склад запрещён. clinicId — только из сессии.
 * Permission: inventory.manage.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import {
  stockCorrectionSchema,
  type InventoryFormState,
} from "@/lib/validation/inventory";
import { issuesToFieldErrors } from "@/lib/validation/patients";

class CorrectionError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

export async function adjustInventoryItemStock(
  _prev: InventoryFormState | undefined,
  formData: FormData,
): Promise<InventoryFormState> {
  const user = await requirePermission("inventory.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const parsed = stockCorrectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const { itemId, type, quantity, reason, note } = parsed.data;

  let lowTransition: { wasLow: boolean; isLow: boolean; itemName: string } | null = null;

  try {
    lowTransition = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"inv:" + itemId}))::text`;

      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, clinicId, deletedAt: null },
      });
      if (!item) throw new CorrectionError("itemNotFound");

      const prev = Number(item.quantity);
      const min = Number(item.minQuantity);
      const isIncoming = type === "adjustment";
      const delta = isIncoming ? quantity : -quantity;
      const next = Math.round((prev + delta) * 1000) / 1000;
      if (next < 0) throw new CorrectionError("insufficientStock");

      await tx.inventoryMovement.create({
        data: {
          clinicId,
          inventoryItemId: item.id,
          type,
          quantity,
          unitCost: item.unitCost,
          reason,
          note,
          performedById: user.id,
        },
      });
      await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: next } });

      return { wasLow: prev <= min, isLow: next <= min, itemName: item.name };
    });

    // Low-stock notification on normal→low transition (non-critical, outside tx)
    if (lowTransition && !lowTransition.wasLow && lowTransition.isLow) {
      await prisma.notification.create({
        data: {
          clinicId,
          channel: "in_app",
          type: "inventory_low_stock",
          body: `Material az qalıb: ${lowTransition.itemName}`,
          scheduledAt: new Date(),
        },
      }).catch(() => {});
    }

    const db = tenantClient(clinicId);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "inventory_movement",
        entityId: itemId,
        after: { type, quantity, reason },
      },
    } as never);
  } catch (e) {
    if (e instanceof CorrectionError) return { error: e.key };
    console.error("adjustInventoryItemStock failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
  return { success: "correctionSuccess" };
}
