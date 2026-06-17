"use server";

/**
 * Server actions для шаблонов расходников услуг (Session 33).
 * Только CRUD шаблонов — фактическое списание склада в Session 34.
 * clinicId всегда из сессии. Permission: settings.manage.
 * Super admin (clinicId = null) заблокирован.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import {
  createConsumableTemplateSchema,
  updateConsumableTemplateSchema,
  deleteConsumableTemplateSchema,
  type ServiceConsumableFormState,
} from "@/lib/validation/service-consumables";
import { issuesToFieldErrors } from "@/lib/validation/patients";

export async function createConsumableTemplate(
  _prev: ServiceConsumableFormState | undefined,
  formData: FormData,
): Promise<ServiceConsumableFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const parsed = createConsumableTemplateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(clinicId);
  try {
    // Service must belong to this clinic
    const service = await db.service.findFirst({
      where: { id: input.serviceId, deletedAt: null },
      select: { id: true },
    });
    if (!service) return { error: "serviceNotFound" };

    // Inventory item must belong to this clinic
    const item = await db.inventoryItem.findFirst({
      where: { id: input.inventoryItemId, deletedAt: null },
      select: { id: true, doseToBaseFactor: true },
    });
    if (!item) return { error: "itemNotFound" };

    // "dose" unit requires doseToBaseFactor
    if (input.unit === "dose" && !item.doseToBaseFactor) {
      return { fieldErrors: { unit: "doseUnitNotAllowed" } };
    }

    // Duplicate: same item can only appear once per service
    const existing = await db.serviceConsumableTemplate.findFirst({
      where: { serviceId: input.serviceId, inventoryItemId: input.inventoryItemId },
      select: { id: true },
    });
    if (existing) return { error: "duplicateItem" };

    await prisma.serviceConsumableTemplate.create({
      data: {
        clinicId,
        serviceId: input.serviceId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        unit: input.unit,
        allowOverride: input.allowOverride,
        isRequired: input.isRequired,
        note: input.note,
      },
    });
  } catch (e) {
    console.error("createConsumableTemplate failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/settings/services/${input.serviceId}`);
  return { saved: true };
}

export async function updateConsumableTemplate(
  _prev: ServiceConsumableFormState | undefined,
  formData: FormData,
): Promise<ServiceConsumableFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const parsed = updateConsumableTemplateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(clinicId);
  try {
    // Verify ownership via tenantClient
    const template = await db.serviceConsumableTemplate.findFirst({
      where: { id: input.templateId },
      include: {
        inventoryItem: { select: { doseToBaseFactor: true } },
      },
    });
    if (!template) return { error: "templateNotFound" };

    if (input.unit === "dose" && !template.inventoryItem.doseToBaseFactor) {
      return { fieldErrors: { unit: "doseUnitNotAllowed" } };
    }

    await prisma.serviceConsumableTemplate.update({
      where: { id: template.id },
      data: {
        quantity: input.quantity,
        unit: input.unit,
        allowOverride: input.allowOverride,
        isRequired: input.isRequired,
        note: input.note,
      },
    });

    revalidatePath(`/settings/services/${template.serviceId}`);
  } catch (e) {
    console.error("updateConsumableTemplate failed:", e);
    return { error: "generic" };
  }

  return { saved: true };
}

export async function deleteConsumableTemplate(
  _prev: ServiceConsumableFormState | undefined,
  formData: FormData,
): Promise<ServiceConsumableFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) return { error: "unauthorized" };
  const clinicId = user.clinicId;

  const parsed = deleteConsumableTemplateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { error: "generic" };

  const db = tenantClient(clinicId);
  try {
    // Verify ownership via tenantClient
    const template = await db.serviceConsumableTemplate.findFirst({
      where: { id: parsed.data.templateId },
      select: { id: true, serviceId: true },
    });
    if (!template) return { error: "templateNotFound" };

    await prisma.serviceConsumableTemplate.delete({ where: { id: template.id } });

    revalidatePath(`/settings/services/${template.serviceId}`);
  } catch (e) {
    console.error("deleteConsumableTemplate failed:", e);
    return { error: "generic" };
  }

  return { saved: true };
}
