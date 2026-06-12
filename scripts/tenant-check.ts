/**
 * Tenant security check (dev-скрипт, запускается вручную):
 *   npx tsx scripts/tenant-check.ts
 *
 * На реальной БД проверяет:
 *  1. tenantClient(A) не видит данные клиники B (findMany/count/findFirst);
 *  2. safeUpdateByTenant / safeDeleteByTenant бросают TenantAccessError на чужой записи;
 *  3. create через tenantClient проставляет clinic_id автоматически;
 *  4. denied user_permission перекрывает ролевое право (формула resolveEffectivePermissions
 *     на реальных данных role_permissions из БД);
 *  5. bcrypt-хэш demo-пароля валиден (вход возможен).
 * Все временные записи удаляются в конце (включая ошибочные прогоны — upsert по slug/email).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  tenantClient,
  safeUpdateByTenant,
  safeDeleteByTenant,
  TenantAccessError,
} from "../lib/tenant";
import { resolveEffectivePermissions } from "../lib/permissions";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  console.log("Tenant security check\n");

  const clinicA = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // временная клиника B + по одному пациенту в A и B
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "tenant-check-b" },
    update: {},
    create: { name: "Tenant Check B", slug: "tenant-check-b", status: "active" },
  });
  const userA = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@demo.dentalpro.az" },
  });

  const dbA = tenantClient(clinicA.id);

  // 3. create через tenantClient проставляет clinicId
  // (cast: типы create у extended-клиента не знают об авто-clinicId)
  const patientA = (await dbA.patient.create({
    data: { firstName: "Test", lastName: "TenantA", phone: "+994500000001" },
  } as never)) as unknown as { id: string; clinicId: string };
  check("create через tenantClient проставил clinic_id", patientA.clinicId === clinicA.id);

  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Test", lastName: "TenantB", phone: "+994500000002" },
  });

  // 1. изоляция чтения
  const allFromA = await dbA.patient.findMany();
  check(
    "findMany клиники A не содержит пациентов B",
    allFromA.every((p) => p.clinicId === clinicA.id),
  );
  const foreign = await dbA.patient.findFirst({ where: { id: patientB.id } });
  check("findFirst по чужому id возвращает null", foreign === null);
  const countA = await dbA.patient.count({ where: { lastName: { startsWith: "Tenant" } } });
  check("count видит только своих (1 из 2)", countA === 1, `got ${countA}`);

  // 2. safe-хелперы блокируют чужие записи
  let blockedUpdate = false;
  try {
    await safeUpdateByTenant(dbA.patient, "Patient", patientB.id, { notes: "hack" });
  } catch (e) {
    blockedUpdate = e instanceof TenantAccessError;
  }
  check("safeUpdateByTenant блокирует чужую запись", blockedUpdate);

  let blockedDelete = false;
  try {
    await safeDeleteByTenant(dbA.patient, "Patient", patientB.id);
  } catch (e) {
    blockedDelete = e instanceof TenantAccessError;
  }
  check("safeDeleteByTenant блокирует чужую запись", blockedDelete);

  const ownUpdate = (await safeUpdateByTenant(dbA.patient, "Patient", patientA.id, {
    notes: "ok",
  })) as unknown as { notes: string | null };
  check("safeUpdateByTenant работает на своей записи", ownUpdate.notes === "ok");

  // 4. denied user_permission перекрывает роль (реальные данные role_permissions)
  const assistant = await prisma.user.findUniqueOrThrow({
    where: { email: "assistent@demo.dentalpro.az" },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const patientsView = await prisma.permission.findUniqueOrThrow({
    where: { key: "patients.view" },
  });
  await prisma.userPermission.upsert({
    where: { userId_permissionId: { userId: assistant.id, permissionId: patientsView.id } },
    update: { allowed: false },
    create: { userId: assistant.id, permissionId: patientsView.id, allowed: false },
  });
  const withDenied = await prisma.user.findUniqueOrThrow({
    where: { id: assistant.id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      extraPermissions: { include: { permission: true } },
    },
  });
  const effective = resolveEffectivePermissions(
    withDenied.role.permissions.map((rp) => rp.permission.key),
    withDenied.extraPermissions.map((up) => ({ key: up.permission.key, allowed: up.allowed })),
  );
  const roleHadIt = withDenied.role.permissions.some(
    (rp) => rp.permission.key === "patients.view",
  );
  check(
    "denied user_permission перекрывает ролевое право",
    roleHadIt && !effective.includes("patients.view"),
  );

  // 5. bcrypt-хэш demo-пароля валиден
  const demoOk = await bcrypt.compare(
    process.env.SEED_DEMO_PASSWORD ?? "Demo1234!",
    userA.passwordHash,
  );
  check("bcrypt: demo-пароль соответствует хэшу в БД", demoOk);

  // cleanup
  await prisma.userPermission.deleteMany({
    where: { userId: assistant.id, permissionId: patientsView.id },
  });
  await prisma.patient.deleteMany({ where: { lastName: { in: ["TenantA", "TenantB"] } } });
  await prisma.clinic.delete({ where: { id: clinicB.id } });
  console.log("\n  (временные данные удалены)");

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
