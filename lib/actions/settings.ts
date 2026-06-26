"use server";

/**
 * Server actions модуля Ayarlar.
 * Все изменения — settings.manage (owner/admin); формам не доверяем:
 * принадлежность service/category клинике перепроверяется через tenantClient.
 * Прайс append-only: смена цены = закрытие текущего периода (validTo)
 * + новая запись Price; записи Price не редактируются.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { saveUploadFile } from "@/lib/storage";
import { sniffUploadMime } from "@/lib/validation/documents";
import { SETTING_KEYS } from "@/lib/settings";
import {
  clinicParamsSchema,
  clinicProfileSchema,
  parseWorkingHoursForm,
  serviceCreateSchema,
  servicePriceSchema,
  serviceToggleSchema,
  type SettingsFormState,
} from "@/lib/validation/settings";
import {
  CLINIC_LOGO_MAX_BYTES,
  CLINIC_LOGO_MIME_EXT,
  type ClinicLogoFormState,
} from "@/lib/validation/clinicLogo";
import { issuesToFieldErrors } from "@/lib/validation/patients";

/** Upsert clinic-scope настройки + audit. Возвращает id записи. */
async function upsertClinicSetting(
  clinicId: string,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: { clinicId, scope: "clinic", doctorId: null, userId: null, key },
    select: { id: true, value: true },
  });
  const json = value as object;
  let settingId: string;
  let before: unknown = null;
  if (existing) {
    if (JSON.stringify(existing.value) === JSON.stringify(value)) return; // без изменений — без audit-шума
    await prisma.setting.update({ where: { id: existing.id }, data: { value: json } });
    settingId = existing.id;
    before = existing.value;
  } else {
    const created = await prisma.setting.create({
      data: { clinicId, scope: "clinic", key, value: json },
    });
    settingId = created.id;
  }
  await prisma.auditLog.create({
    data: {
      clinicId,
      userId,
      action: existing ? "update" : "create",
      entityType: "setting",
      entityId: settingId,
      before: before === null ? undefined : { key, value: before },
      after: { key, value: json },
    },
  });
}

export async function updateClinicProfile(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = clinicProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, phone: true, email: true, address: true },
    });
    if (!clinic) return { error: "generic" };

    await prisma.clinic.update({
      where: { id: clinicId },
      data: { name: input.name, phone: input.phone, email: input.email, address: input.address },
    });
    await prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: "update",
        entityType: "clinic",
        entityId: clinicId,
        before: clinic,
        after: input,
      },
    });
  } catch (e) {
    console.error("updateClinicProfile failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  return { saved: true };
}

/**
 * Загрузка логотипа клиники (сессия 81). clinicId — только из сессии
 * (как в updateClinicProfile), клиенту не доверяем. mime — по магическим
 * байтам (тот же sniffUploadMime, что у документов пациента), PDF/SVG
 * отклоняются — для лого допустимы только PNG/JPEG/WebP.
 * Старый файл на диске не удаляется (см. CLINIC_LOGO.md) — тот же v1-паттерн,
 * что и у soft-delete документов пациента (orphan-файлы допустимы).
 */
export async function uploadClinicLogo(
  _prev: ClinicLogoFormState | undefined,
  formData: FormData,
): Promise<ClinicLogoFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "fileRequired" };
  if (file.size > CLINIC_LOGO_MAX_BYTES) return { error: "fileTooLarge" };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > CLINIC_LOGO_MAX_BYTES) return { error: "fileTooLarge" };

    const mime = sniffUploadMime(bytes);
    if (!mime || !CLINIC_LOGO_MIME_EXT[mime]) return { error: "unsupportedType" };

    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { logoUrl: true } });
    if (!clinic) return { error: "generic" };

    const fileName = `logo-${Date.now()}-${randomBytes(4).toString("hex")}.${CLINIC_LOGO_MIME_EXT[mime]}`;
    const fileUrl = `clinic-logos/${clinicId}/${fileName}`;
    await saveUploadFile(fileUrl, bytes);

    await prisma.clinic.update({ where: { id: clinicId }, data: { logoUrl: fileUrl } });
    await prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: "update",
        entityType: "clinic",
        entityId: clinicId,
        before: { logoUrl: clinic.logoUrl },
        after: { logoUrl: fileUrl },
      },
    });
  } catch (e) {
    console.error("uploadClinicLogo failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  return { saved: true };
}

export async function updateClinicParams(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = clinicParamsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  try {
    await upsertClinicSetting(
      clinicId,
      user.id,
      SETTING_KEYS.defaultAppointmentMinutes,
      input.defaultAppointmentMinutes,
    );
    await upsertClinicSetting(
      clinicId,
      user.id,
      SETTING_KEYS.reminderHoursBefore,
      input.reminderHoursBefore,
    );
    await upsertClinicSetting(
      clinicId,
      user.id,
      SETTING_KEYS.doctorSeesAllPatients,
      input.doctorSeesAllPatients,
    );
  } catch (e) {
    console.error("updateClinicParams failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  revalidatePath("/patients");
  return { saved: true };
}

export async function updateWorkingHours(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = parseWorkingHoursForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  try {
    await upsertClinicSetting(clinicId, user.id, SETTING_KEYS.workingHours, parsed.value);
  } catch (e) {
    console.error("updateWorkingHours failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings");
  return { saved: true };
}

export async function createService(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = serviceCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(clinicId);
  try {
    // категория — только своей клиники
    if (input.categoryId) {
      const cat = await db.serviceCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!cat) input.categoryId = null;
    }
    const duplicate = await db.service.findFirst({
      where: { name: input.name, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) return { error: "serviceExists" };

    const serviceId = await prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          clinicId,
          name: input.name,
          categoryId: input.categoryId,
          durationMin: input.durationMin,
          isChildService: input.isChildService,
        },
      });
      if (input.price !== null) {
        await tx.price.create({
          data: {
            clinicId,
            serviceId: service.id,
            price: input.price,
            childPrice: input.childPrice,
            validFrom: new Date(),
          },
        });
      }
      return service.id;
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "service",
        entityId: serviceId,
        after: { name: input.name, price: input.price },
      },
    } as never);
  } catch (e) {
    console.error("createService failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/services");
  return { saved: true };
}

export async function updateServicePrice(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = servicePriceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const input = parsed.data;

  const db = tenantClient(clinicId);
  try {
    const service = await db.service.findFirst({
      where: { id: input.serviceId, deletedAt: null },
      select: { id: true },
    });
    if (!service) return { error: "serviceNotFound" };

    const current = await db.price.findFirst({
      where: { serviceId: service.id, validTo: null },
      select: { id: true, price: true, childPrice: true },
    });
    // цена не изменилась — не плодим записи прайса
    if (current && current.price === input.price && current.childPrice === input.childPrice) {
      return { saved: true };
    }

    const priceId = await prisma.$transaction(async (tx) => {
      const today = new Date();
      if (current) {
        await tx.price.update({ where: { id: current.id }, data: { validTo: today } });
      }
      const created = await tx.price.create({
        data: {
          clinicId,
          serviceId: service.id,
          price: input.price,
          childPrice: input.childPrice,
          validFrom: today,
        },
      });
      return created.id;
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entityType: "price",
        entityId: priceId,
        before: current ? { price: current.price, childPrice: current.childPrice } : undefined,
        after: { serviceId: service.id, price: input.price, childPrice: input.childPrice },
      },
    } as never);
  } catch (e) {
    console.error("updateServicePrice failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/services");
  return { saved: true };
}

export async function toggleServiceActive(
  _prev: SettingsFormState | undefined,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requirePermission("settings.manage");
  if (!user.clinicId) redirect("/dashboard");
  const clinicId = user.clinicId;

  const parsed = serviceToggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "serviceNotFound" };

  const db = tenantClient(clinicId);
  try {
    const service = await db.service.findFirst({
      where: { id: parsed.data.serviceId, deletedAt: null },
      select: { id: true, isActive: true, name: true },
    });
    if (!service) return { error: "serviceNotFound" };

    await prisma.service.update({
      where: { id: service.id },
      data: { isActive: !service.isActive },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "service",
        entityId: service.id,
        before: { isActive: service.isActive },
        after: { isActive: !service.isActive },
      },
    } as never);
  } catch (e) {
    console.error("toggleServiceActive failed:", e);
    return { error: "generic" };
  }

  revalidatePath("/settings/services");
  return { saved: true };
}
