"use server";

/**
 * Session 34 — TreatmentConsumableUsage server actions.
 * Bulk-apply service consumable templates to a treatment item:
 * - verifies treatment item belongs to clinic (tenant isolation)
 * - verifies each inventory item belongs to clinic
 * - prevents double-apply (idempotency via existing usage records)
 * - checks stock availability atomically
 * - creates InventoryMovement (treatment_usage) + TreatmentConsumableUsage in a single tx
 * - clinicId always from session, never from client
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { getTreatmentItemForUser } from "@/lib/treatments";
import { calculateBaseQuantity } from "@/lib/treatment-consumables";
import { consumableUsageItemSchema, type ConsumableUsageFormState } from "@/lib/validation/treatment-consumables";

class ConsumableError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Apply consumable templates to a treatment item.
 * Called from TreatmentConsumableChecklist client component via useActionState.
 * FormData encodes: treatmentItemId, items[N].inventoryItemId, items[N].quantity, etc.
 */
export async function applyTreatmentConsumablesAction(
  _prev: ConsumableUsageFormState | undefined,
  formData: FormData,
): Promise<ConsumableUsageFormState> {
  const user = await requirePermission("treatments.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const treatmentItemId = formData.get("treatmentItemId")?.toString() ?? "";
  if (!treatmentItemId) return { error: "generic" };

  // parse items array from flat FormData: items[0].inventoryItemId, items[0].quantity, ...
  const rawItems: Record<string, Record<string, string>> = {};
  for (const [key, val] of formData.entries()) {
    const m = key.match(/^items\[(\d+)\]\.(.+)$/);
    if (m) {
      const [, idx, field] = m;
      if (!rawItems[idx]) rawItems[idx] = {};
      rawItems[idx][field] = val.toString();
    }
  }

  const parsedItems: Array<{
    inventoryItemId: string;
    templateId: string | null;
    quantity: number;
    unit: string;
    wasSkipped: boolean;
    note: string | null;
  }> = [];

  for (const raw of Object.values(rawItems)) {
    const result = consumableUsageItemSchema.safeParse(raw);
    if (!result.success) return { error: "quantityInvalid" };
    parsedItems.push(result.data);
  }

  if (parsedItems.length === 0) return { error: "noItems" };

  // verify treatment item belongs to clinic (tenant-scoped)
  const treatment = await getTreatmentItemForUser(user, treatmentItemId);
  if (!treatment) return { error: "treatmentNotFound" };
  if (treatment.status === "cancelled") return { error: "treatmentCancelled" };

  const db = tenantClient(clinicId);

  // double-apply protection: check if any non-skipped usage with movement already exists
  const existingCount = await db.treatmentConsumableUsage.count({
    where: {
      treatmentItemId,
      wasSkipped: false,
      inventoryMovementId: { not: null },
    },
  });
  if (existingCount > 0) return { error: "alreadyApplied" };

  // required items must not be skipped — validate before DB work
  for (const item of parsedItems) {
    if (item.wasSkipped) {
      // check template isRequired via templateId
      if (item.templateId) {
        const tpl = await db.serviceConsumableTemplate.findFirst({
          where: { id: item.templateId },
          select: { isRequired: true },
        });
        if (tpl?.isRequired) return { error: "requiredItemSkipped" };
      }
    }
  }

  // verify all inventory items belong to clinic & compute base quantities
  type PreparedItem = {
    inventoryItemId: string;
    templateId: string | null;
    quantity: number;
    unit: string;
    baseQuantity: number;
    baseUnit: string;
    wasSkipped: boolean;
    note: string | null;
    allowOverride: boolean;
    isRequired: boolean;
  };

  const prepared: PreparedItem[] = [];
  for (const item of parsedItems) {
    if (item.wasSkipped) {
      prepared.push({
        ...item,
        baseQuantity: 0,
        baseUnit: "",
        allowOverride: true,
        isRequired: false,
      });
      continue;
    }
    const invItem = await db.inventoryItem.findFirst({
      where: { id: item.inventoryItemId, deletedAt: null },
      select: { id: true, unit: true, doseToBaseFactor: true },
    });
    if (!invItem) return { error: "itemNotFound" };

    let baseQty: number;
    let baseUnit: string;
    try {
      const conv = calculateBaseQuantity(item.quantity, item.unit, {
        unit: invItem.unit,
        doseToBaseFactor: invItem.doseToBaseFactor ? Number(invItem.doseToBaseFactor) : null,
      });
      baseQty = conv.baseQuantity;
      baseUnit = conv.baseUnit;
    } catch (e) {
      if (e instanceof Error && e.message === "doseUnitNotAllowed") return { error: "doseUnitNotAllowed" };
      return { error: "unitUnsupported" };
    }

    // template meta
    let allowOverride = true;
    let isRequired = false;
    if (item.templateId) {
      const tpl = await db.serviceConsumableTemplate.findFirst({
        where: { id: item.templateId },
        select: { allowOverride: true, isRequired: true },
      });
      if (tpl) {
        allowOverride = tpl.allowOverride;
        isRequired = tpl.isRequired;
      }
    }

    prepared.push({
      ...item,
      baseQuantity: baseQty,
      baseUnit,
      allowOverride,
      isRequired,
    });
  }

  // transactional stock deduction + record creation
  try {
    await prisma.$transaction(async (tx: Tx) => {
      for (const item of prepared) {
        if (item.wasSkipped) {
          // record skip without movement
          await tx.treatmentConsumableUsage.create({
            data: {
              clinicId,
              treatmentItemId,
              serviceId: treatment.serviceId,
              inventoryItemId: item.inventoryItemId,
              templateId: item.templateId,
              quantity: item.quantity,
              unit: item.unit,
              baseQuantity: 0,
              baseUnit: "",
              allowOverride: item.allowOverride,
              isRequired: item.isRequired,
              wasSkipped: true,
              note: item.note,
              createdById: user.id,
            },
          });
          continue;
        }

        // advisory lock per item to prevent concurrent deductions
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"inv:" + item.inventoryItemId}))::text`;

        const stockItem = await tx.inventoryItem.findFirst({
          where: { id: item.inventoryItemId, clinicId, deletedAt: null },
          select: { id: true, quantity: true, unitCost: true },
        });
        if (!stockItem) throw new ConsumableError("itemNotFound");

        const prev = Number(stockItem.quantity);
        const next = Math.round((prev - item.baseQuantity) * 1000) / 1000;
        if (next < 0) throw new ConsumableError("insufficientStock");

        const movement = await tx.inventoryMovement.create({
          data: {
            clinicId,
            inventoryItemId: item.inventoryItemId,
            type: "treatment_usage",
            quantity: item.baseQuantity,
            unitCost: stockItem.unitCost,
            reason: "Sərfiyyat şablonu üzrə istifadə",
            treatmentItemId,
            performedById: user.id,
          },
          select: { id: true },
        });

        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { quantity: next },
        });

        await tx.treatmentConsumableUsage.create({
          data: {
            clinicId,
            treatmentItemId,
            serviceId: treatment.serviceId,
            inventoryItemId: item.inventoryItemId,
            templateId: item.templateId,
            quantity: item.quantity,
            unit: item.unit,
            baseQuantity: item.baseQuantity,
            baseUnit: item.baseUnit,
            allowOverride: item.allowOverride,
            isRequired: item.isRequired,
            wasSkipped: false,
            note: item.note,
            inventoryMovementId: movement.id,
            createdById: user.id,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof ConsumableError) return { error: e.key };
    console.error("applyTreatmentConsumablesAction failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/treatments/${treatmentItemId}/consumables`);
  revalidatePath(`/patients/${treatment.patientId}/treatments`);
  revalidatePath("/inventory");
  return { saved: true };
}
