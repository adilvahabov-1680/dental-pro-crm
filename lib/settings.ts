/**
 * Запросы модуля Ayarlar (server-only, не "use server").
 * Клиника читается точечно по clinicId сессии (Clinic не входит в TENANT_MODELS —
 * у неё нет колонки clinic_id, фильтр = сам id).
 * Настройки — таблица settings (scope=clinic), key-value Json.
 */
import { prisma } from "@/lib/prisma";
import { tenantClient } from "@/lib/tenant";
import { WEEK_DAYS, type WorkingHours } from "@/lib/validation/settings";
import type { SessionUser } from "@/types/auth";

export const SETTING_KEYS = {
  doctorSeesAllPatients: "doctor_sees_all_patients",
  reminderHoursBefore: "reminder_hours_before",
  defaultAppointmentMinutes: "default_appointment_minutes",
  workingHours: "working_hours",
} as const;

export async function getClinicProfile(user: SessionUser) {
  if (!user.clinicId) return null;
  return prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      logoUrl: true,
      updatedAt: true,
    },
  });
}

async function clinicSettingValue(clinicId: string, key: string): Promise<unknown> {
  const row = await prisma.setting.findFirst({
    where: { clinicId, scope: "clinic", doctorId: null, userId: null, key },
    select: { value: true },
  });
  return row?.value;
}

export interface ClinicParams {
  defaultAppointmentMinutes: number;
  reminderHoursBefore: number;
  doctorSeesAllPatients: boolean;
}

export async function getClinicParams(user: SessionUser): Promise<ClinicParams> {
  const defaults: ClinicParams = {
    defaultAppointmentMinutes: 30,
    reminderHoursBefore: 24,
    doctorSeesAllPatients: false,
  };
  if (!user.clinicId) return defaults;
  const [minutes, hours, seesAll] = await Promise.all([
    clinicSettingValue(user.clinicId, SETTING_KEYS.defaultAppointmentMinutes),
    clinicSettingValue(user.clinicId, SETTING_KEYS.reminderHoursBefore),
    clinicSettingValue(user.clinicId, SETTING_KEYS.doctorSeesAllPatients),
  ]);
  return {
    defaultAppointmentMinutes:
      typeof minutes === "number" ? minutes : defaults.defaultAppointmentMinutes,
    reminderHoursBefore: typeof hours === "number" ? hours : defaults.reminderHoursBefore,
    doctorSeesAllPatients: seesAll === true,
  };
}

const EMPTY_WEEK: WorkingHours = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
};

/** Часы работы клиники; незаполненные/повреждённые дни → null (закрыто). */
export async function getWorkingHours(user: SessionUser): Promise<WorkingHours> {
  if (!user.clinicId) return EMPTY_WEEK;
  const raw = await clinicSettingValue(user.clinicId, SETTING_KEYS.workingHours);
  const result: WorkingHours = { ...EMPTY_WEEK };
  if (raw && typeof raw === "object") {
    for (const day of WEEK_DAYS) {
      const d = (raw as Record<string, unknown>)[day];
      if (
        d &&
        typeof d === "object" &&
        typeof (d as { from?: unknown }).from === "string" &&
        typeof (d as { to?: unknown }).to === "string"
      ) {
        result[day] = { from: (d as { from: string }).from, to: (d as { to: string }).to };
      }
    }
  }
  return result;
}

export interface ServiceWithPrice {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number | null;
  isChildService: boolean;
  isActive: boolean;
  /** qəpik; null = текущей цены нет */
  price: number | null;
  childPrice: number | null;
  priceValidFrom: Date | null;
}

/** Все услуги клиники (вкл. неактивные) с текущей ценой — для страницы прайса. */
export async function listServicesForSettings(user: SessionUser): Promise<ServiceWithPrice[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const services = await db.service.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      durationMin: true,
      isChildService: true,
      isActive: true,
      category: { select: { name: true } },
      prices: {
        where: { validTo: null },
        take: 1,
        select: { price: true, childPrice: true, validFrom: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    categoryName: s.category?.name ?? null,
    durationMin: s.durationMin,
    isChildService: s.isChildService,
    isActive: s.isActive,
    price: s.prices[0]?.price ?? null,
    childPrice: s.prices[0]?.childPrice ?? null,
    priceValidFrom: s.prices[0]?.validFrom ?? null,
  }));
}

/** Категории услуг для select'а формы. */
export async function listServiceCategories(user: SessionUser) {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.serviceCategory.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}
