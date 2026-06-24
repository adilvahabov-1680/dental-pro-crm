/**
 * Dental Pro CRM — demo-safe seed (идемпотентный, можно запускать повторно).
 * Запуск: npm run db:seed  (нужны DATABASE_URL и применённые миграции).
 *
 * Создаёт: каталог permissions, 7 системных ролей с дефолтными правами,
 * demo-клинику, super admin / clinic admin / врача / ассистента,
 * категории услуг и склада, базовые настройки клиники.
 *
 * Пароли — только bcrypt-хэш (plain text не хранится).
 * Demo-пароль: env SEED_DEMO_PASSWORD (default admin123 — для demo/Vercel).
 */
import { PrismaClient, RoleKey, SettingScope, ToothStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../lib/permissions";

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "admin123";

const SERVICE_CATEGORIES = [
  "Terapiya",
  "Ortopediya",
  "Cərrahiyyə",
  "Ortodontiya",
  "Uşaq stomatologiyası",
  "Gigiyena",
];

const INVENTORY_CATEGORIES = [
  "Plomba materialları",
  "Anesteziya",
  "Endodontiya",
  "Ortopedik materiallar",
  "Birdəfəlik ləvazimat",
  "İmplant",
  "Gigiyena",
];

const CLINIC_SETTINGS: Array<{ key: string; value: unknown }> = [
  { key: "doctor_sees_all_patients", value: false },
  { key: "reminder_hours_before", value: 24 },
  { key: "default_appointment_minutes", value: 30 },
  {
    key: "working_hours",
    value: {
      mon: { from: "09:00", to: "18:00" },
      tue: { from: "09:00", to: "18:00" },
      wed: { from: "09:00", to: "18:00" },
      thu: { from: "09:00", to: "18:00" },
      fri: { from: "09:00", to: "18:00" },
      sat: { from: "10:00", to: "14:00" },
      sun: null,
    },
  },
];

async function upsertUser(opts: {
  email: string;
  fullName: string;
  clinicId: string | null;
  roleId: string;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: opts.email },
    update: { roleId: opts.roleId, clinicId: opts.clinicId },
    create: {
      email: opts.email,
      fullName: opts.fullName,
      clinicId: opts.clinicId,
      roleId: opts.roleId,
      passwordHash: opts.passwordHash,
      locale: "az",
    },
  });
}

async function main() {
  console.log("→ Seeding Dental Pro CRM…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Каталог permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  console.log(`  permissions: ${PERMISSIONS.length}`);

  // 2. Системные роли + role_permissions
  const roleIds: Partial<Record<RoleKey, string>> = {};
  for (const key of Object.values(RoleKey)) {
    let role = await prisma.role.findFirst({ where: { key, clinicId: null } });
    if (!role) {
      role = await prisma.role.create({
        data: { key, name: `roles.${key}`, isSystem: true },
      });
    }
    roleIds[key] = role.id;

    const permKeys = DEFAULT_ROLE_PERMISSIONS[key] ?? [];
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } });
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log("  roles: 7 system roles + defaults");

  // 3. Demo-клиника
  const clinic = await prisma.clinic.upsert({
    where: { slug: "demo-klinika" },
    update: {},
    create: {
      name: "Demo Klinika",
      slug: "demo-klinika",
      phone: "+994 55 000 00 00",
      email: "info@demo.dentalpro.az",
      address: "Nizami küç. 12, Bakı",
      status: "active",
      timezone: "Asia/Baku",
      currency: "AZN",
      defaultLocale: "az",
    },
  });
  console.log(`  clinic: ${clinic.name}`);

  // 4. Пользователи (demo-safe)
  await upsertUser({
    email: "superadmin@dentalpro.az",
    fullName: "Super Admin",
    clinicId: null,
    roleId: roleIds.super_admin!,
    passwordHash,
  });
  // Short alias for super_admin (matches LOGIN_ALIASES in lib/actions/auth.ts)
  await upsertUser({
    email: "super@demo.dentalpro.az",
    fullName: "Super Admin",
    clinicId: null,
    roleId: roleIds.super_admin!,
    passwordHash,
  });
  const adminUser = await upsertUser({
    email: "admin@demo.dentalpro.az",
    fullName: "Aysel Məmmədova",
    clinicId: clinic.id,
    roleId: roleIds.owner!,
    passwordHash,
  });
  const docUser = await upsertUser({
    email: "hekim@demo.dentalpro.az",
    fullName: "Dr. Elvin Quliyev",
    clinicId: clinic.id,
    roleId: roleIds.doctor!,
    passwordHash,
  });
  const asstUser = await upsertUser({
    email: "assistent@demo.dentalpro.az",
    fullName: "Nigar Əliyeva",
    clinicId: clinic.id,
    roleId: roleIds.assistant!,
    passwordHash,
  });
  console.log("  users: super admin, clinic admin, doctor, assistant");

  // 5. Профили врача и ассистента
  const doctor = await prisma.doctor.upsert({
    where: { userId: docUser.id },
    update: {},
    create: {
      clinicId: clinic.id,
      userId: docUser.id,
      specialty: "Terapevt",
      color: "#22D3EE",
    },
  });
  await prisma.assistant.upsert({
    where: { userId: asstUser.id },
    update: { assignedDoctorId: doctor.id },
    create: { clinicId: clinic.id, userId: asstUser.id, assignedDoctorId: doctor.id },
  });

  // 6. Категории услуг
  for (const [i, name] of SERVICE_CATEGORIES.entries()) {
    const exists = await prisma.serviceCategory.findFirst({
      where: { clinicId: clinic.id, name },
    });
    if (!exists) {
      await prisma.serviceCategory.create({
        data: { clinicId: clinic.id, name, sortOrder: i },
      });
    }
  }
  console.log(`  service categories: ${SERVICE_CATEGORIES.length}`);

  // 7. Категории склада
  for (const name of INVENTORY_CATEGORIES) {
    const exists = await prisma.inventoryCategory.findFirst({
      where: { clinicId: clinic.id, name },
    });
    if (!exists) {
      await prisma.inventoryCategory.create({ data: { clinicId: clinic.id, name } });
    }
  }
  console.log(`  inventory categories: ${INVENTORY_CATEGORIES.length}`);

  // 8. Базовые настройки клиники (scope=clinic)
  for (const s of CLINIC_SETTINGS) {
    const exists = await prisma.setting.findFirst({
      where: { clinicId: clinic.id, scope: SettingScope.clinic, key: s.key },
    });
    if (!exists) {
      await prisma.setting.create({
        data: {
          clinicId: clinic.id,
          scope: SettingScope.clinic,
          key: s.key,
          value: s.value as object,
        },
      });
    }
  }
  console.log(`  clinic settings: ${CLINIC_SETTINGS.length}`);

  // 9. Demo-пациенты (идемпотентно: поиск по clinic+phone / clinic+имя)
  async function upsertPatient(data: {
    firstName: string;
    lastName: string;
    phone?: string;
    birthDate?: string;
    gender?: "male" | "female";
    allergies?: string;
    chronicDiseases?: string;
    primaryDoctorId?: string;
    guardianId?: string;
  }) {
    const existing = await prisma.patient.findFirst({
      where: data.phone
        ? { clinicId: clinic.id, phone: data.phone }
        : { clinicId: clinic.id, firstName: data.firstName, lastName: data.lastName },
    });
    if (existing) return existing;
    return prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender ?? null,
        allergies: data.allergies ?? null,
        chronicDiseases: data.chronicDiseases ?? null,
        primaryDoctorId: data.primaryDoctorId ?? null,
        guardianId: data.guardianId ?? null,
        source: "demo seed",
      },
    });
  }

  const resad = await upsertPatient({
    firstName: "Rəşad",
    lastName: "Həsənov",
    phone: "+994501112233",
    birthDate: "1988-04-12",
    gender: "male",
    allergies: "Penisilin",
    primaryDoctorId: doctor.id,
  });
  await upsertPatient({
    firstName: "Leyla",
    lastName: "Quliyeva",
    phone: "+994552223344",
    birthDate: "1975-09-30",
    gender: "female",
    chronicDiseases: "Diabet tip 2",
    primaryDoctorId: doctor.id,
  });
  await upsertPatient({
    firstName: "Tural",
    lastName: "Məmmədov",
    phone: "+994703334455",
    birthDate: "1995-01-20",
    gender: "male",
    // без врача — для проверки doctor-scope (врач его не видит)
  });
  await upsertPatient({
    firstName: "Aysu",
    lastName: "Həsənova",
    birthDate: "2019-06-15",
    gender: "female",
    guardianId: resad.id, // ребёнок Rəşad'а — телефон через himayəçi
    primaryDoctorId: doctor.id,
  });
  console.log("  demo patients: 3 adult + 1 child (guardian linked)");

  // 10. Demo-статусы зубной карты Rəşad'а (идемпотентно: только create)
  let resadChart = await prisma.dentalChart.findFirst({
    where: { clinicId: clinic.id, patientId: resad.id, chartType: "adult" },
  });
  if (!resadChart) {
    resadChart = await prisma.dentalChart.create({
      data: { clinicId: clinic.id, patientId: resad.id, chartType: "adult" },
    });
  }
  const demoTeeth: Array<{ n: number; s: ToothStatus; d?: string }> = [
    { n: 16, s: ToothStatus.needs_treatment, d: "Dərin kariyes" },
    { n: 36, s: ToothStatus.filling, d: "Kompozit plomba" },
    { n: 11, s: ToothStatus.completed },
    { n: 46, s: ToothStatus.root_canal, d: "Kanal müalicəsi aparılır" },
  ];
  for (const tooth of demoTeeth) {
    const exists = await prisma.toothRecord.findFirst({
      where: { dentalChartId: resadChart.id, toothNumber: tooth.n },
    });
    if (!exists) {
      await prisma.toothRecord.create({
        data: {
          clinicId: clinic.id,
          patientId: resad.id,
          dentalChartId: resadChart.id,
          toothNumber: tooth.n,
          dentition: "permanent",
          status: tooth.s,
          diagnosis: tooth.d ?? null,
          updatedById: docUser.id,
          doctorId: doctor.id,
        },
      });
    }
  }
  console.log("  demo tooth records: 16/36/11/46 (Rəşad)");

  // 11. Demo-приёмы (идемпотентно: маркер source в notes; создаются один раз,
  // даты относительны дню первого запуска)
  const leyla = await prisma.patient.findFirstOrThrow({
    where: { clinicId: clinic.id, phone: "+994552223344" },
  });
  const demoAppts: Array<{
    patientId: string;
    dayOffset: number;
    hour: number;
    durationMin: number;
    status: "scheduled" | "confirmed" | "completed";
    complaint: string;
  }> = [
    { patientId: resad.id, dayOffset: 0, hour: 10, durationMin: 30, status: "scheduled", complaint: "Diş ağrısı (16)" },
    { patientId: leyla.id, dayOffset: 0, hour: 11, durationMin: 45, status: "confirmed", complaint: "Profilaktik baxış" },
    { patientId: resad.id, dayOffset: -1, hour: 15, durationMin: 60, status: "completed", complaint: "Kanal müalicəsi (46)" },
  ];
  for (const a of demoAppts) {
    const marker = `demo-seed:${a.complaint}`;
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + a.dayOffset);
    startsAt.setHours(a.hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + a.durationMin * 60_000);
    const exists = await prisma.appointment.findFirst({
      where: { clinicId: clinic.id, patientId: a.patientId, notes: marker },
    });
    if (exists) {
      // demo-даты освежаются при каждом seed: «сегодняшние» приёмы остаются сегодняшними
      if (exists.startsAt.getTime() !== startsAt.getTime()) {
        await prisma.appointment.update({
          where: { id: exists.id },
          data: { startsAt, endsAt },
        });
      }
      continue;
    }
    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: a.patientId,
        doctorId: doctor.id,
        startsAt,
        endsAt,
        status: a.status,
        complaint: a.complaint,
        notes: marker,
        createdById: docUser.id,
      },
    });
  }
  console.log("  demo appointments: 2 today + 1 completed yesterday");

  // 12. Demo-услуги с ценами (цены в гяпиках; текущая цена = validTo null)
  const terapiya = await prisma.serviceCategory.findFirst({
    where: { clinicId: clinic.id, name: "Terapiya" },
  });
  const DEMO_SERVICES: Array<{ name: string; price: number | null }> = [
    { name: "Kariyes müalicəsi", price: 80_00 },
    { name: "Kompozit plomba", price: 90_00 },
    { name: "Kanal müalicəsi", price: 150_00 },
    { name: "Profilaktik təmizlik", price: 50_00 },
    { name: "Konsultasiya", price: null }, // без прайса — проверка ручного ввода цены
  ];
  const serviceIds: Record<string, string> = {};
  for (const s of DEMO_SERVICES) {
    let svc = await prisma.service.findFirst({ where: { clinicId: clinic.id, name: s.name } });
    if (!svc) {
      svc = await prisma.service.create({
        data: { clinicId: clinic.id, name: s.name, categoryId: terapiya?.id ?? null },
      });
    }
    serviceIds[s.name] = svc.id;
    if (s.price !== null) {
      const hasPrice = await prisma.price.findFirst({
        where: { clinicId: clinic.id, serviceId: svc.id, validTo: null },
      });
      if (!hasPrice) {
        await prisma.price.create({
          data: {
            clinicId: clinic.id,
            serviceId: svc.id,
            price: s.price,
            validFrom: new Date(),
          },
        });
      }
    }
  }
  console.log(`  demo services: ${DEMO_SERVICES.length} (1 без цены)`);

  // 13. Demo-план и процедуры Rəşad'а (идемпотентно: маркер в notes)
  let plan = await prisma.treatmentPlan.findFirst({
    where: { clinicId: clinic.id, patientId: resad.id, title: "Rəşad — ilkin müalicə planı" },
  });
  if (!plan) {
    plan = await prisma.treatmentPlan.create({
      data: {
        clinicId: clinic.id,
        patientId: resad.id,
        doctorId: doctor.id,
        title: "Rəşad — ilkin müalicə planı",
        status: "in_progress",
      },
    });
  }
  const demoAppt16 = await prisma.appointment.findFirst({
    where: { clinicId: clinic.id, notes: "demo-seed:Diş ağrısı (16)" },
  });
  const yesterdayAt = (h: number) => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const DEMO_ITEMS: Array<{
    tooth: number;
    service: string;
    status: "done" | "in_progress";
    price: number;
    appointmentId?: string;
    performedAt?: Date;
  }> = [
    {
      tooth: 16,
      service: "Kariyes müalicəsi",
      status: "done",
      price: 80_00,
      appointmentId: demoAppt16?.id,
      performedAt: yesterdayAt(16),
    },
    { tooth: 36, service: "Kompozit plomba", status: "done", price: 90_00, performedAt: yesterdayAt(17) },
    { tooth: 46, service: "Kanal müalicəsi", status: "in_progress", price: 150_00 },
  ];
  for (const it of DEMO_ITEMS) {
    const marker = `demo-seed:${it.service}:${it.tooth}`;
    const exists = await prisma.treatmentItem.findFirst({
      where: { clinicId: clinic.id, patientId: resad.id, notes: marker },
    });
    if (exists) continue;
    const rec = await prisma.toothRecord.findFirst({
      where: { clinicId: clinic.id, patientId: resad.id, toothNumber: it.tooth },
      select: { id: true },
    });
    await prisma.treatmentItem.create({
      data: {
        clinicId: clinic.id,
        patientId: resad.id,
        doctorId: doctor.id,
        treatmentPlanId: plan.id,
        serviceId: serviceIds[it.service],
        toothNumber: it.tooth,
        toothRecordId: rec?.id ?? null,
        appointmentId: it.appointmentId ?? null,
        status: it.status,
        price: it.price,
        performedAt: it.performedAt ?? null,
        notes: marker,
      },
    });
  }
  // totalPrice плана = сумма некэнселённых items
  const planItems = await prisma.treatmentItem.findMany({
    where: { treatmentPlanId: plan.id, deletedAt: null, status: { notIn: ["cancelled"] } },
    select: { price: true, discount: true },
  });
  await prisma.treatmentPlan.update({
    where: { id: plan.id },
    data: { totalPrice: planItems.reduce((s, i) => s + i.price - i.discount, 0) },
  });
  console.log("  demo treatment: 1 plan + 3 items (16/36/46)");

  // 13a. Свободная done-процедура без счёта (для UI «Hesab yarat»)
  const freeMarker = "demo-seed:Profilaktik təmizlik:free";
  const freeExists = await prisma.treatmentItem.findFirst({
    where: { clinicId: clinic.id, patientId: resad.id, notes: freeMarker },
  });
  if (!freeExists) {
    await prisma.treatmentItem.create({
      data: {
        clinicId: clinic.id,
        patientId: resad.id,
        doctorId: doctor.id,
        serviceId: serviceIds["Profilaktik təmizlik"],
        status: "done",
        price: 50_00,
        performedAt: yesterdayAt(18),
        notes: freeMarker,
      },
    });
  }

  // 14. Demo-счёт Rəşad'а из done-процедур 16+36 (80+90=170 AZN) + частичная оплата 100 AZN
  let invoice = await prisma.invoice.findFirst({
    where: { clinicId: clinic.id, patientId: resad.id, notes: "demo-seed-invoice" },
  });
  if (!invoice) {
    const billables = await prisma.treatmentItem.findMany({
      where: {
        clinicId: clinic.id,
        patientId: resad.id,
        status: "done",
        invoiceId: null,
        notes: { in: ["demo-seed:Kariyes müalicəsi:16", "demo-seed:Kompozit plomba:36"] },
      },
      include: { service: { select: { name: true } } },
    });
    if (billables.length === 2) {
      const subtotal = billables.reduce((s, i) => s + i.price - i.discount, 0);
      const maxNum = await prisma.invoice.aggregate({
        where: { clinicId: clinic.id },
        _max: { number: true },
      });
      invoice = await prisma.invoice.create({
        data: {
          clinicId: clinic.id,
          patientId: resad.id,
          doctorId: doctor.id,
          number: (maxNum._max.number ?? 0) + 1,
          status: "partially_paid",
          subtotal,
          total: subtotal,
          paidAmount: 100_00,
          notes: "demo-seed-invoice",
        },
      });
      await prisma.invoiceItem.createMany({
        data: billables.map((i) => ({
          clinicId: clinic.id,
          invoiceId: invoice!.id,
          treatmentItemId: i.id,
          description: `${i.service.name}${i.toothNumber ? ` · Diş ${i.toothNumber}` : ""}`,
          qty: 1,
          unitPrice: i.price - i.discount,
          total: i.price - i.discount,
        })),
      });
      await prisma.treatmentItem.updateMany({
        where: { id: { in: billables.map((i) => i.id) } },
        data: { invoiceId: invoice.id },
      });
      await prisma.payment.create({
        data: {
          clinicId: clinic.id,
          patientId: resad.id,
          invoiceId: invoice.id,
          amount: 100_00,
          method: "cash",
          paidAt: yesterdayAt(18),
          receivedById: adminUser.id,
          notes: "demo-seed-payment",
        },
      });
      await prisma.debt.create({
        data: {
          clinicId: clinic.id,
          patientId: resad.id,
          invoiceId: invoice.id,
          amount: subtotal - 100_00,
          status: "partial",
        },
      });
      console.log("  demo finance: invoice 170 AZN, paid 100, debt 70");
    }
  }

  // 15. Demo-материалы склада (идемпотентно: по clinic+name)
  // Сессия 64: единая AZ-конвенция единиц измерения — `unit` (= baseUnit
  // склада) ВСЕГДА равен реальной единице расхода/использования (ədəd —
  // штука, cüt — пара, karpul — картридж), НИКОГДА закупочной упаковке.
  // `purchaseUnit` + `purchaseToBaseFactor` — только для прихода (qutu/paket
  // → во сколько раз больше базовых единиц в одной упаковке). Источники
  // реалистичных чисел — docs/INVENTORY_MEDICINE_UNITS_V2_PLAN.md §6.
  const catByName = new Map<string, string>();
  for (const name of INVENTORY_CATEGORIES) {
    const c = await prisma.inventoryCategory.findFirst({
      where: { clinicId: clinic.id, name },
    });
    if (c) catByName.set(name, c.id);
  }
  const DEMO_MATERIALS: Array<{
    name: string;
    category: string;
    unit: string;
    qty: number;
    min: number;
    cost?: number;
    purchaseUnit?: string;
    purchaseToBaseFactor?: number;
  }> = [
    {
      name: "Artikain 4% + epinefrin anesteziyası",
      category: "Anesteziya",
      unit: "karpul",
      qty: 30,
      min: 10,
      cost: 2_50,
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 50, // 1 qutu = 50 karpul
    },
    { name: "Kompozit A2", category: "Plomba materialları", unit: "şpris", qty: 8, min: 3, cost: 45_00 },
    { name: "Bonding agent", category: "Plomba materialları", unit: "şüşə", qty: 2, min: 2, cost: 60_00 },
    { name: "Endo file set", category: "Endodontiya", unit: "dəst", qty: 5, min: 2, cost: 25_00 },
    {
      // baseUnit = cüt (cərt) — əsas vahid REAL istifadə vahididir, qutu YOX.
      name: "Lateks əlcək M",
      category: "Birdəfəlik ləvazimat",
      unit: "cüt",
      qty: 40,
      min: 100,
      cost: 20, // ~0.20 AZN/cüt (qutu ~10 AZN / 50 cüt)
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 50, // 1 qutu (100 ədəd) = 50 cüt
    },
    {
      name: "Steril maska",
      category: "Gigiyena",
      unit: "ədəd",
      qty: 300,
      min: 150,
      cost: 10, // ~0.10 AZN/ədəd (qutu ~5 AZN / 50 ədəd)
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 50, // 1 qutu = 50 ədəd
    },
    {
      name: "Bir dəfəlik iynə (27G)",
      category: "Birdəfəlik ləvazimat",
      unit: "ədəd",
      qty: 150,
      min: 100,
      cost: 6, // ~0.06 AZN/ədəd (qutu ~6 AZN / 100 ədəd)
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 100, // 1 qutu = 100 ədəd
    },
    {
      name: "Tüpürcək sorucu",
      category: "Birdəfəlik ləvazimat",
      unit: "ədəd",
      qty: 80,
      min: 50,
      cost: 4, // ~0.04 AZN/ədəd (paket ~4 AZN / 100 ədəd)
      purchaseUnit: "paket",
      purchaseToBaseFactor: 100, // 1 paket = 100 ədəd
    },
    {
      name: "Bir dəfəlik önlük",
      category: "Gigiyena",
      unit: "ədəd",
      qty: 400,
      min: 250,
      cost: 3, // ~0.03 AZN/ədəd (qutu ~15 AZN / 500 ədəd)
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 500, // 1 qutu = 500 ədəd
    },
  ];
  const materialIds = new Map<string, string>();
  for (const m of DEMO_MATERIALS) {
    let item = await prisma.inventoryItem.findFirst({
      where: { clinicId: clinic.id, name: m.name },
    });
    if (!item) {
      item = await prisma.inventoryItem.create({
        data: {
          clinicId: clinic.id,
          name: m.name,
          categoryId: catByName.get(m.category) ?? null,
          unit: m.unit,
          quantity: m.qty,
          minQuantity: m.min,
          unitCost: m.cost ?? null,
          purchaseUnit: m.purchaseUnit ?? null,
          ...(m.purchaseToBaseFactor !== undefined ? { purchaseToBaseFactor: m.purchaseToBaseFactor } : {}),
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          clinicId: clinic.id,
          inventoryItemId: item.id,
          type: "in_stock",
          quantity: m.qty,
          unitCost: m.cost ?? null,
          reason: "demo-seed: ilkin qalıq",
          performedById: adminUser.id,
        },
      });
    }
    materialIds.set(m.name, item.id);
  }
  console.log(`  demo inventory: ${DEMO_MATERIALS.length} materials (2 low stock)`);

  // 15a. Demo-шаблоны стандартного расхода на услугу (idempotent, сессия 64) —
  // показывают реальный default-usage workflow с правильно настроенными
  // единицами измерения (ServiceConsumableTemplate, см. SERVICE_CONSUMABLE_TEMPLATES.md).
  const DEMO_CONSUMABLE_TEMPLATES: Array<{
    service: string;
    items: Array<{ material: string; quantity: number; unit: string; isRequired?: boolean }>;
  }> = [
    {
      service: "Profilaktik təmizlik",
      items: [
        { material: "Lateks əlcək M", quantity: 1, unit: "cüt" },
        { material: "Steril maska", quantity: 1, unit: "ədəd" },
      ],
    },
    {
      service: "Kompozit plomba",
      items: [
        { material: "Lateks əlcək M", quantity: 1, unit: "cüt" },
        { material: "Steril maska", quantity: 1, unit: "ədəd" },
        { material: "Artikain 4% + epinefrin anesteziyası", quantity: 1, unit: "karpul", isRequired: false },
      ],
    },
    {
      service: "Kanal müalicəsi",
      items: [
        { material: "Lateks əlcək M", quantity: 1, unit: "cüt" },
        { material: "Steril maska", quantity: 1, unit: "ədəd" },
        { material: "Artikain 4% + epinefrin anesteziyası", quantity: 1, unit: "karpul" },
        { material: "Bir dəfəlik iynə (27G)", quantity: 1, unit: "ədəd" },
      ],
    },
  ];
  let templateCount = 0;
  for (const tpl of DEMO_CONSUMABLE_TEMPLATES) {
    const svcId = serviceIds[tpl.service];
    if (!svcId) continue;
    for (const it of tpl.items) {
      const invId = materialIds.get(it.material);
      if (!invId) continue;
      const exists = await prisma.serviceConsumableTemplate.findFirst({
        where: { clinicId: clinic.id, serviceId: svcId, inventoryItemId: invId },
      });
      if (exists) continue;
      await prisma.serviceConsumableTemplate.create({
        data: {
          clinicId: clinic.id,
          serviceId: svcId,
          inventoryItemId: invId,
          quantity: it.quantity,
          unit: it.unit,
          isRequired: it.isRequired ?? true,
        },
      });
      templateCount++;
    }
  }
  console.log(`  demo consumable templates: ${DEMO_CONSUMABLE_TEMPLATES.length} services (${templateCount} items)`);

  // 16. Списание материалов на demo-процедуру Rəşad tooth 16 (идемпотентно)
  const item16 = await prisma.treatmentItem.findFirst({
    where: { clinicId: clinic.id, notes: "demo-seed:Kariyes müalicəsi:16" },
  });
  if (item16) {
    const DEMO_USAGE: Array<{ name: string; qty: number }> = [
      { name: "Kompozit A2", qty: 1 },
      { name: "Artikain anesteziya", qty: 1 },
      { name: "Bonding agent", qty: 0.2 },
    ];
    for (const u of DEMO_USAGE) {
      const invId = materialIds.get(u.name)!;
      const exists = await prisma.treatmentItemMaterial.findFirst({
        where: { treatmentItemId: item16.id, inventoryItemId: invId },
      });
      if (exists) continue;
      const inv = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: invId } });
      await prisma.treatmentItemMaterial.create({
        data: {
          clinicId: clinic.id,
          treatmentItemId: item16.id,
          inventoryItemId: invId,
          quantity: u.qty,
          unitCost: inv.unitCost ?? 0,
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          clinicId: clinic.id,
          inventoryItemId: invId,
          type: "out_stock",
          quantity: u.qty,
          unitCost: inv.unitCost,
          reason: "demo-seed: müalicədə istifadə",
          treatmentItemId: item16.id,
          performedById: docUser.id,
        },
      });
      await prisma.inventoryItem.update({
        where: { id: invId },
        data: { quantity: Math.round((Number(inv.quantity) - u.qty) * 1000) / 1000 },
      });
    }
    console.log("  demo materials usage: tooth 16 (Kompozit 1, Artikain 1, Bonding 0.2)");
  }

  // ─── 21. Demo treatment protocols (idempotent) ───────────────
  // 3 протокола: Sadə dolğu (1 шаг), Kanal müalicəsi (3 шага), İmplant (4 шага).
  // Услуги берём из уже созданных выше serviceIds.
  interface ProtoDef {
    name: string;
    desc: string;
    steps: { serviceName: string; intervalDays: number | null; durationMin: number | null }[];
  }
  const DEMO_PROTOCOLS: ProtoDef[] = [
    {
      name: "Sadə dolğu",
      desc: "Sadə kariyes müalicəsi: diaqnoz + plomba",
      steps: [
        { serviceName: "Kariyes müalicəsi", intervalDays: null, durationMin: 30 },
        { serviceName: "Kompozit plomba", intervalDays: 0, durationMin: 45 },
      ],
    },
    {
      name: "Kanal müalicəsi protokolu",
      desc: "3 mərhələli kanal müalicəsi",
      steps: [
        { serviceName: "Konsultasiya", intervalDays: null, durationMin: 30 },
        { serviceName: "Kanal müalicəsi", intervalDays: 1, durationMin: 90 },
        { serviceName: "Kompozit plomba", intervalDays: 7, durationMin: 45 },
      ],
    },
    {
      name: "Profilaktik müayinə",
      desc: "İllik profilaktik müayinə + təmizlik",
      steps: [
        { serviceName: "Konsultasiya", intervalDays: null, durationMin: 20 },
        { serviceName: "Profilaktik təmizlik", intervalDays: 0, durationMin: 60 },
      ],
    },
  ];
  for (const pd of DEMO_PROTOCOLS) {
    let proto = await prisma.treatmentProtocol.findFirst({
      where: { clinicId: clinic.id, name: pd.name },
    });
    if (!proto) {
      proto = await prisma.treatmentProtocol.create({
        data: { clinicId: clinic.id, name: pd.name, description: pd.desc },
      });
    }
    for (let i = 0; i < pd.steps.length; i++) {
      const sd = pd.steps[i];
      const svcId = serviceIds[sd.serviceName];
      if (!svcId) continue;
      const stepExists = await prisma.treatmentProtocolStep.findFirst({
        where: { protocolId: proto.id, serviceId: svcId, deletedAt: null },
      });
      if (!stepExists) {
        await prisma.treatmentProtocolStep.create({
          data: {
            clinicId: clinic.id,
            protocolId: proto.id,
            serviceId: svcId,
            orderIndex: i,
            durationMin: sd.durationMin,
            intervalDays: sd.intervalDays,
          },
        });
      }
    }
  }
  console.log("  demo protocols: 3 (Sadə dolğu, Kanal müalicəsi, Profilaktik müayinə)");

  // 22. Personal platform owner account (optional, from env)
  // Set PLATFORM_OWNER_EMAIL + PLATFORM_OWNER_PASSWORD + PLATFORM_OWNER_LOGIN
  // in .env to create/update a personal super_admin account.
  // Never hardcode real credentials here.
  const poEmail = process.env.PLATFORM_OWNER_EMAIL;
  const poPassword = process.env.PLATFORM_OWNER_PASSWORD;
  const poLogin = process.env.PLATFORM_OWNER_LOGIN; // short alias, logged only
  const poName = process.env.PLATFORM_OWNER_NAME ?? "Platform Owner";

  if (poEmail && poPassword) {
    const poHash = await bcrypt.hash(poPassword, 10);
    const poUser = await prisma.user.upsert({
      where: { email: poEmail },
      update: {
        fullName: poName,
        roleId: roleIds.super_admin!,
        clinicId: null,
        isActive: true,
        passwordHash: poHash,
      },
      create: {
        email: poEmail,
        fullName: poName,
        clinicId: null,
        roleId: roleIds.super_admin!,
        passwordHash: poHash,
        locale: "az",
      },
    });
    console.log(`  platform owner: ${poUser.email}${poLogin ? ` (alias: ${poLogin})` : ""}`);
  }

  // 16. Demo-supplier catalog
  let demoSupplier = await prisma.supplier.findFirst({
    where: { clinicId: clinic.id, name: "Demo Dental Təchizat" },
  });
  if (!demoSupplier) {
    demoSupplier = await prisma.supplier.create({
      data: {
        clinicId: clinic.id,
        name: "Demo Dental Təchizat",
        contactName: "Tural Həsənov",
        phone: "+994 55 123 45 67",
        whatsapp: "+994 55 123 45 67",
        email: "info@demosupplier.az",
        address: "Hüseyn Cavid pr. 40, Bakı",
        notes: "Demo məqsədli təchizatçı",
      },
    });
  }
  const DEMO_CATALOG = [
    { sku: "DC-001", name: "Septanest 1:100000 kartuş", category: "Anesteziya", brand: "Septodont", unit: "qutu", price: "45.00", availability: "Var" },
    { sku: "DC-002", name: "Filtek Z250 kompozit A2 4q", category: "Plomba materialları", brand: "3M ESPE", unit: "ədəd", price: "28.50", availability: "Var" },
    { sku: "DC-003", name: "ProTaper Next F1 fayl dəsti", category: "Endodontiya", brand: "Dentsply Sirona", unit: "dəst", price: "62.00", availability: "Sifarişlə" },
    { sku: "DC-004", name: "Birdəfəlik əlcək L ölçü (100 əd)", category: "Birdəfəlik ləvazimat", brand: "Medicom", unit: "qutu", price: "12.00", availability: "Var" },
  ];
  for (const item of DEMO_CATALOG) {
    const exists = await prisma.supplierCatalogItem.findFirst({
      where: { clinicId: clinic.id, supplierId: demoSupplier.id, sku: item.sku },
    });
    if (!exists) {
      await prisma.supplierCatalogItem.create({
        data: {
          clinicId: clinic.id,
          supplierId: demoSupplier.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          brand: item.brand,
          unit: item.unit,
          price: item.price,
          currency: "AZN",
          availability: item.availability,
          sourceRow: DEMO_CATALOG.indexOf(item) + 2,
        },
      });
    }
  }
  console.log("  demo supplier: Demo Dental Təchizat + 4 catalog items");

  // 17. Demo supplier order (sent status, 2 items)
  const existingOrder = await prisma.supplierOrder.findFirst({
    where: { clinicId: clinic.id, number: "SO-DEMO-01" },
  });
  if (!existingOrder) {
    const catalogItems = await prisma.supplierCatalogItem.findMany({
      where: { clinicId: clinic.id, supplierId: demoSupplier.id, isActive: true },
      take: 2,
    });
    const order = await prisma.supplierOrder.create({
      data: {
        clinicId: clinic.id,
        supplierId: demoSupplier.id,
        number: "SO-DEMO-01",
        status: "sent",
        totalCost: 0,
        sentAt: new Date(),
        createdById: adminUser.id,
        notes: "Demo sifarişi",
      },
    });
    let totalCost = 0;
    for (const ci of catalogItems) {
      const price = Number(ci.price);
      const qty = 2;
      await prisma.supplierOrderItem.create({
        data: {
          clinicId: clinic.id,
          supplierOrderId: order.id,
          catalogItemId: ci.id,
          quantity: String(qty),
          unitCost: Math.round(price * 100),
          nameSnapshot: ci.name,
          skuSnapshot: ci.sku ?? null,
          unitSnapshot: ci.unit ?? null,
          priceSnapshot: String(price),
          currencySnapshot: ci.currency,
        },
      });
      totalCost += Math.round(price * 100) * qty;
    }
    await prisma.supplierOrder.update({ where: { id: order.id }, data: { totalCost } });
    console.log("  demo supplier order: SO-DEMO-01 (sent, 2 items)");
  } else {
    console.log("  demo supplier order: SO-DEMO-01 already exists");
  }

  // 18. Demo supplier order in received status (for receiving e2e tests)
  const existingOrder2 = await prisma.supplierOrder.findFirst({
    where: { clinicId: clinic.id, number: "SO-DEMO-02" },
  });
  if (!existingOrder2) {
    const catalogItems2 = await prisma.supplierCatalogItem.findMany({
      where: { clinicId: clinic.id, supplierId: demoSupplier.id, isActive: true },
      take: 2,
    });
    const order2 = await prisma.supplierOrder.create({
      data: {
        clinicId: clinic.id,
        supplierId: demoSupplier.id,
        number: "SO-DEMO-02",
        status: "received",
        totalCost: 0,
        sentAt: new Date(),
        receivedAt: new Date(),
        createdById: adminUser.id,
        notes: "Demo qəbul sifarişi",
      },
    });
    let totalCost2 = 0;
    for (const ci of catalogItems2) {
      const price = Number(ci.price);
      const qty = 3;
      await prisma.supplierOrderItem.create({
        data: {
          clinicId: clinic.id,
          supplierOrderId: order2.id,
          catalogItemId: ci.id,
          quantity: String(qty),
          unitCost: Math.round(price * 100),
          nameSnapshot: ci.name,
          skuSnapshot: ci.sku ?? null,
          unitSnapshot: ci.unit ?? null,
          priceSnapshot: String(price),
          currencySnapshot: ci.currency,
        },
      });
      totalCost2 += Math.round(price * 100) * qty;
    }
    await prisma.supplierOrder.update({ where: { id: order2.id }, data: { totalCost: totalCost2 } });
    console.log("  demo supplier order: SO-DEMO-02 (received, 2 items, not yet received to stock)");
  } else {
    console.log("  demo supplier order: SO-DEMO-02 already exists");
  }

  // Статусы зубов и приёмов — Postgres enum'ы (ToothStatus, AppointmentStatus),
  // их AZ-метки — в lib/constants.ts (TOOTH_STATUS_META, APPOINTMENT_STATUS_META).
  console.log("✓ Seed finished");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
