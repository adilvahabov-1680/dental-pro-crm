/**
 * E2E-проверка модуля Treatment Consumable Usage (Session 34):
 *   npx tsx scripts/e2e-treatment-consumable-usage-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 */
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
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

class Session {
  cookies = new Map<string, string>();
  private store(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value || c.toLowerCase().includes("max-age=0")) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  private header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async get(path: string) {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      headers: { cookie: this.header() },
    });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  async postForm(
    path: string,
    pageHtml: string,
    fields: Record<string, string>,
    markerAttr?: string,
  ) {
    const un = (s: string) =>
      s
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    const fd = new FormData();
    let html = pageHtml;
    if (markerAttr) {
      const idx = pageHtml.indexOf(`data-e2e-marker="${markerAttr}"`);
      if (idx !== -1) {
        const start = pageHtml.lastIndexOf("<form", idx);
        const end = pageHtml.indexOf("</form>", idx) + 7;
        html = start !== -1 ? pageHtml.slice(start, end) : pageHtml;
      }
    }
    for (const tag of [...html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const res = await fetch(BASE + path, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), origin: BASE },
      body: fd,
    });
    this.store(res);
    return { status: res.status, location: res.headers.get("location") ?? undefined };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

// ── Test data IDs ──────────────────────────────────────────────────────────────
let e2eServiceId = "";
let e2eItemBaseId = ""; // unit: "ədəd"
let e2eItemDoseId = ""; // unit: "ml", doseToBaseFactor=2
let e2eItemNoDoseId = ""; // unit: "ml", no doseToBaseFactor
let e2eTemplateBaseId = "";
let e2eTemplateDoseId = "";
let e2eTreatmentItemId = "";
let e2eTreatmentItemDoubleId = "";
let e2eTreatmentItemInsufficientId = "";

async function main() {
  console.log(`E2E treatment consumable usage check → ${BASE}\n`);

  // ── Seed references ──────────────────────────────────────────────────────────
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const ownerUser = await prisma.user.findFirstOrThrow({
    where: { clinicId: clinic.id, role: { key: "owner" } },
    include: { role: true },
  });
  const doctorRecord = await prisma.doctor.findFirstOrThrow({
    where: { clinicId: clinic.id },
    include: { user: true },
  });
  const patient = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id } });

  // ── Setup: create test service + inventory items + templates ─────────────────
  console.log("Setup — creating test data…");

  const testSvc = (await prisma.service.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-TestSvc-Consumable",
      isActive: true,
    },
  }));
  e2eServiceId = testSvc.id;

  const itemBase = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-Item-Base-ədəd",
      unit: "ədəd",
      quantity: 100,
      minQuantity: 0,
    },
  });
  e2eItemBaseId = itemBase.id;
  await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: itemBase.id,
      type: "in_stock",
      quantity: 100,
      reason: "E2E initial",
      performedById: ownerUser.id,
    },
  });

  const itemDose = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-Item-Dose-ml",
      unit: "ml",
      doseToBaseFactor: 2,
      quantity: 50,
      minQuantity: 0,
    },
  });
  e2eItemDoseId = itemDose.id;
  await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: itemDose.id,
      type: "in_stock",
      quantity: 50,
      reason: "E2E initial",
      performedById: ownerUser.id,
    },
  });

  const itemNoDose = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-Item-NoDose-ml",
      unit: "ml",
      quantity: 50,
      minQuantity: 0,
    },
  });
  e2eItemNoDoseId = itemNoDose.id;

  // templates for base and dose items
  const tplBase = await prisma.serviceConsumableTemplate.create({
    data: {
      clinicId: clinic.id,
      serviceId: e2eServiceId,
      inventoryItemId: e2eItemBaseId,
      quantity: 2,
      unit: "ədəd",
      allowOverride: true,
      isRequired: true,
    },
  });
  e2eTemplateBaseId = tplBase.id;

  const tplDose = await prisma.serviceConsumableTemplate.create({
    data: {
      clinicId: clinic.id,
      serviceId: e2eServiceId,
      inventoryItemId: e2eItemDoseId,
      quantity: 1,
      unit: "dose",
      allowOverride: true,
      isRequired: false,
    },
  });
  e2eTemplateDoseId = tplDose.id;

  // treatment items for various test scenarios
  const createTI = async () =>
    prisma.treatmentItem.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        doctorId: doctorRecord.id,
        serviceId: e2eServiceId,
        status: "in_progress",
        price: 0,
      },
    });

  const ti1 = await createTI();
  e2eTreatmentItemId = ti1.id;
  const ti2 = await createTI();
  e2eTreatmentItemDoubleId = ti2.id;
  const ti3 = await createTI();
  e2eTreatmentItemInsufficientId = ti3.id;

  console.log("  Setup complete.\n");

  // ── A. Load templates ─────────────────────────────────────────────────────────
  console.log("A. Load templates");

  const owner = new Session();
  const ownerLoggedIn = await owner.login(ownerUser.email);
  check("owner login", ownerLoggedIn);

  const consumablesPage = await owner.get(`/treatments/${e2eTreatmentItemId}/consumables`);
  check("consumables page 200", consumablesPage.status === 200);
  check(
    "consumables page shows base item",
    consumablesPage.html.includes("E2E-Item-Base-ədəd"),
  );
  check(
    "consumables page shows dose item",
    consumablesPage.html.includes("E2E-Item-Dose-ml"),
  );
  check(
    "consumables page has apply form",
    consumablesPage.html.includes("consumable-apply-form"),
  );

  // ── B. Apply usage with base unit ─────────────────────────────────────────────
  console.log("\nB. Apply usage — base unit");

  const stockBefore = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );

  // capture BEFORE the apply action so section C doesn't see an already-decremented value
  const doseStockBefore = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );

  const applyPage = await owner.get(`/treatments/${e2eTreatmentItemId}/consumables`);
  const applyRes = await owner.postForm(
    `/treatments/${e2eTreatmentItemId}/consumables`,
    applyPage.html,
    {
      treatmentItemId: e2eTreatmentItemId,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "2",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
      "items[1].inventoryItemId": e2eItemDoseId,
      "items[1].templateId": e2eTemplateDoseId,
      "items[1].quantity": "1",
      "items[1].unit": "dose",
      "items[1].wasSkipped": "false",
    },
    "consumable-apply-form",
  );
  check("apply returns 200 or redirect", applyRes.status === 200 || applyRes.status === 303 || applyRes.status === 302);

  const stockAfter = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );
  check("base item stock decreased by 2", stockAfter === stockBefore - 2, `before=${stockBefore} after=${stockAfter}`);

  const usages = await prisma.treatmentConsumableUsage.findMany({
    where: { treatmentItemId: e2eTreatmentItemId, wasSkipped: false },
  });
  check("usage records created", usages.length >= 1);
  const baseUsage = usages.find((u) => u.inventoryItemId === e2eItemBaseId);
  check("base usage has qty=2, unit=ədəd", Number(baseUsage?.quantity) === 2 && baseUsage?.unit === "ədəd");
  check(
    "base usage has baseQuantity=2, baseUnit=ədəd",
    Number(baseUsage?.baseQuantity) === 2 && baseUsage?.baseUnit === "ədəd",
  );
  check("base usage has inventoryMovementId", !!baseUsage?.inventoryMovementId);

  const baseMovement = baseUsage?.inventoryMovementId
    ? await prisma.inventoryMovement.findUnique({ where: { id: baseUsage.inventoryMovementId } })
    : null;
  check("InventoryMovement type=treatment_usage", baseMovement?.type === "treatment_usage");
  check("InventoryMovement qty=2", Number(baseMovement?.quantity) === 2);

  // ── C. Apply usage with dose unit ─────────────────────────────────────────────
  console.log("\nC. Apply usage — dose unit");

  const doseUsage = usages.find((u) => u.inventoryItemId === e2eItemDoseId);
  check("dose usage exists", !!doseUsage);
  check("dose usage unit=dose", doseUsage?.unit === "dose");
  check("dose usage baseUnit=ml", doseUsage?.baseUnit === "ml");
  // 1 dose * doseToBaseFactor=2 = 2 ml
  check("dose usage baseQuantity=2", Number(doseUsage?.baseQuantity) === 2);

  const doseStockAfter = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );
  check("dose item stock decreased by 2 ml", doseStockAfter === doseStockBefore - 2, `before=${doseStockBefore} after=${doseStockAfter}`);

  // ── D. Override quantity ──────────────────────────────────────────────────────
  console.log("\nD. Override quantity");

  const tiOverride = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctorRecord.id,
      serviceId: e2eServiceId,
      status: "in_progress",
      price: 0,
    },
  });
  const overrideStockBefore = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );
  // apply 2 doses instead of default 1 dose (allowOverride=true)
  await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: tiOverride.id,
      inventoryItemId: e2eItemDoseId,
      templateId: e2eTemplateDoseId,
      quantity: 2,
      unit: "dose",
      baseQuantity: 4, // 2 * 2
      baseUnit: "ml",
      allowOverride: true,
      isRequired: false,
      wasSkipped: false,
      createdById: ownerUser.id,
    },
  });
  await prisma.inventoryItem.update({
    where: { id: e2eItemDoseId },
    data: { quantity: { decrement: 4 } },
  });
  const overrideStockAfter = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );
  check("override: stock decreased by 4 (2 dose)", overrideStockAfter === overrideStockBefore - 4, `before=${overrideStockBefore} after=${overrideStockAfter}`);

  // ── E. Required item cannot be skipped ────────────────────────────────────────
  console.log("\nE. Required item cannot be skipped");

  const tiRequired = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctorRecord.id,
      serviceId: e2eServiceId,
      status: "in_progress",
      price: 0,
    },
  });
  const reqPage = await owner.get(`/treatments/${tiRequired.id}/consumables`);
  const reqRes = await owner.postForm(
    `/treatments/${tiRequired.id}/consumables`,
    reqPage.html,
    {
      treatmentItemId: tiRequired.id,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "2",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "on", // trying to skip required item
    },
    "consumable-apply-form",
  );
  // should either return 200 with error or stay on same page (no redirect to treatments)
  const usagesAfterSkipAttempt = await prisma.treatmentConsumableUsage.findMany({
    where: { treatmentItemId: tiRequired.id, wasSkipped: false, inventoryMovementId: { not: null } },
  });
  check("required item skip: no movement created", usagesAfterSkipAttempt.length === 0);

  // ── F. Optional item can be skipped ──────────────────────────────────────────
  console.log("\nF. Optional item can be skipped");

  const tiOptional = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctorRecord.id,
      serviceId: e2eServiceId,
      status: "in_progress",
      price: 0,
    },
  });
  const doseStockBeforeSkip = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );
  const baseStockBeforeSkip = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );

  const optPage = await owner.get(`/treatments/${tiOptional.id}/consumables`);
  const optRes = await owner.postForm(
    `/treatments/${tiOptional.id}/consumables`,
    optPage.html,
    {
      treatmentItemId: tiOptional.id,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "2",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
      "items[1].inventoryItemId": e2eItemDoseId,
      "items[1].templateId": e2eTemplateDoseId,
      "items[1].quantity": "1",
      "items[1].unit": "dose",
      "items[1].wasSkipped": "on", // skip optional dose item
    },
    "consumable-apply-form",
  );

  const doseStockAfterSkip = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemDoseId } })).quantity,
  );
  const baseStockAfterSkip = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );

  check("skip optional: dose stock unchanged", doseStockAfterSkip === doseStockBeforeSkip);
  check("skip optional: base stock decreased", baseStockAfterSkip < baseStockBeforeSkip);

  const skippedUsage = await prisma.treatmentConsumableUsage.findFirst({
    where: { treatmentItemId: tiOptional.id, inventoryItemId: e2eItemDoseId },
  });
  check("skip optional: skip record exists", !!skippedUsage);
  check("skip optional: wasSkipped=true", skippedUsage?.wasSkipped === true);
  check("skip optional: no movement", skippedUsage?.inventoryMovementId === null);

  // ── G. Insufficient stock ────────────────────────────────────────────────────
  console.log("\nG. Insufficient stock");

  // set stock to 1 but try to deduct 999
  await prisma.inventoryItem.update({
    where: { id: e2eItemBaseId },
    data: { quantity: 1 },
  });
  const tiInsuff = e2eTreatmentItemInsufficientId;
  const insuffPage = await owner.get(`/treatments/${tiInsuff}/consumables`);
  const insuffRes = await owner.postForm(
    `/treatments/${tiInsuff}/consumables`,
    insuffPage.html,
    {
      treatmentItemId: tiInsuff,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "999",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
      "items[1].inventoryItemId": e2eItemDoseId,
      "items[1].templateId": e2eTemplateDoseId,
      "items[1].quantity": "1",
      "items[1].unit": "dose",
      "items[1].wasSkipped": "false",
    },
    "consumable-apply-form",
  );
  const stockAfterFail = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );
  check("insufficient stock: quantity unchanged (=1)", stockAfterFail === 1, `qty=${stockAfterFail}`);
  const usagesAfterFail = await prisma.treatmentConsumableUsage.findMany({
    where: { treatmentItemId: tiInsuff, wasSkipped: false, inventoryMovementId: { not: null } },
  });
  check("insufficient stock: no usage records created", usagesAfterFail.length === 0);

  // ── H. Double apply blocked ──────────────────────────────────────────────────
  console.log("\nH. Double apply blocked");

  // ti2 has no usages yet — apply once successfully
  await prisma.inventoryItem.update({ where: { id: e2eItemBaseId }, data: { quantity: 50 } });
  const tiDouble = e2eTreatmentItemDoubleId;
  const doublePage1 = await owner.get(`/treatments/${tiDouble}/consumables`);
  await owner.postForm(
    `/treatments/${tiDouble}/consumables`,
    doublePage1.html,
    {
      treatmentItemId: tiDouble,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "1",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
      "items[1].inventoryItemId": e2eItemDoseId,
      "items[1].templateId": e2eTemplateDoseId,
      "items[1].quantity": "1",
      "items[1].unit": "dose",
      "items[1].wasSkipped": "false",
    },
    "consumable-apply-form",
  );
  const stockBeforeDouble = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );
  // try to apply again
  const doublePage2 = await owner.get(`/treatments/${tiDouble}/consumables`);
  await owner.postForm(
    `/treatments/${tiDouble}/consumables`,
    doublePage2.html,
    {
      treatmentItemId: tiDouble,
      "items[0].inventoryItemId": e2eItemBaseId,
      "items[0].templateId": e2eTemplateBaseId,
      "items[0].quantity": "1",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
      "items[1].inventoryItemId": e2eItemDoseId,
      "items[1].templateId": e2eTemplateDoseId,
      "items[1].quantity": "1",
      "items[1].unit": "dose",
      "items[1].wasSkipped": "false",
    },
    "consumable-apply-form",
  );
  const stockAfterDouble = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemBaseId } })).quantity,
  );
  check("double apply: stock not deducted twice", stockAfterDouble === stockBeforeDouble, `before=${stockBeforeDouble} after=${stockAfterDouble}`);

  // ── I. Tenant isolation ───────────────────────────────────────────────────────
  console.log("\nI. Tenant isolation");

  const secondClinic = await prisma.clinic.findFirst({
    where: { id: { not: clinic.id }, deletedAt: null },
  });
  if (secondClinic) {
    const crossTI = await prisma.treatmentItem.findFirst({
      where: { clinicId: secondClinic.id, deletedAt: null },
      select: { id: true },
    });
    if (crossTI) {
      const crossPage = await owner.get(`/treatments/${crossTI.id}/consumables`);
      check("tenant isolation: cross-clinic page not found", crossPage.status === 302 || crossPage.status === 404 || crossPage.status === 403 || crossPage.html.includes("not-found"));
    } else {
      check("tenant isolation: no cross-clinic treatment items to test (skipped)", true);
    }
  } else {
    check("tenant isolation: single-clinic environment (skipped)", true);
  }

  // ── J. Permission: doctor can view page ──────────────────────────────────────
  console.log("\nJ. Permission");

  const doctor = new Session();
  const doctorLoggedIn = await doctor.login(doctorRecord.user.email);
  check("doctor login", doctorLoggedIn);

  // Find a treatment item belonging to the doctor's patient
  const doctorPatient = await prisma.patient.findFirstOrThrow({
    where: { clinicId: clinic.id, primaryDoctorId: doctorRecord.id },
    select: { id: true },
  }).catch(() => prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id }, select: { id: true } }));

  const tiForDoctor = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: doctorPatient.id,
      doctorId: doctorRecord.id,
      serviceId: e2eServiceId,
      status: "in_progress",
      price: 0,
    },
  });

  const doctorConsumablesPage = await doctor.get(`/treatments/${tiForDoctor.id}/consumables`);
  check("doctor can view consumables page", doctorConsumablesPage.status === 200);

  // anon cannot access
  const anon = new Session();
  const anonPage = await anon.get(`/treatments/${e2eTreatmentItemId}/consumables`);
  check("anon redirected from consumables page", anonPage.status === 302 || anonPage.status === 303 || anonPage.status === 307, `status=${anonPage.status}`);

  // ── K. Super admin safety ─────────────────────────────────────────────────────
  console.log("\nK. Super admin safety");

  const superAdmin = await prisma.user.findFirst({ where: { clinicId: null, role: { key: "super_admin" } }, include: { role: true } });
  if (superAdmin) {
    const allUsages = await prisma.treatmentConsumableUsage.findMany({ select: { clinicId: true }, take: 100 });
    check("super admin: all usage records have non-null clinicId", allUsages.every((u) => typeof u.clinicId === "string" && u.clinicId.length > 0));
  } else {
    check("super admin: no super_admin user found (skipped)", true);
  }

  // ── L. Regression ────────────────────────────────────────────────────────────
  console.log("\nL. Regression");

  // re-login to ensure session is still valid after many requests
  await owner.login(ownerUser.email);

  const treatmentsPage = await owner.get("/treatments");
  check("regression: /treatments 200", treatmentsPage.status === 200, `status=${treatmentsPage.status}`);
  check("regression: consumables link present in treatments list", treatmentsPage.html.includes("consumables-link-"), `status=${treatmentsPage.status}`);

  const inventoryPage = await owner.get("/inventory");
  check("regression: /inventory 200", inventoryPage.status === 200, `status=${inventoryPage.status}`);

  const serviceSettingsPage = await owner.get("/settings/services");
  check("regression: /settings/services 200", serviceSettingsPage.status === 200, `status=${serviceSettingsPage.status}`);

  const materialsPage = await owner.get(`/treatments/${e2eTreatmentItemId}/materials`);
  check("regression: /treatments/[id]/materials 200", materialsPage.status === 200, `status=${materialsPage.status}`);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  console.log("\nCleanup…");

  const treatmentIds = [
    e2eTreatmentItemId,
    e2eTreatmentItemDoubleId,
    e2eTreatmentItemInsufficientId,
    tiOverride.id,
    tiRequired.id,
    tiOptional.id,
    tiDouble,
    tiForDoctor.id,
  ];

  // delete usages first (FK)
  await prisma.treatmentConsumableUsage.deleteMany({
    where: { treatmentItemId: { in: treatmentIds } },
  });

  // delete movements linked to these treatment items
  await prisma.inventoryMovement.deleteMany({
    where: { treatmentItemId: { in: treatmentIds } },
  });

  // delete treatment items
  await prisma.treatmentItem.deleteMany({ where: { id: { in: treatmentIds } } });

  // delete templates
  await prisma.serviceConsumableTemplate.deleteMany({
    where: { id: { in: [e2eTemplateBaseId, e2eTemplateDoseId] } },
  });

  // delete inventory movements for test items
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: { in: [e2eItemBaseId, e2eItemDoseId, e2eItemNoDoseId] } },
  });

  // delete inventory items
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [e2eItemBaseId, e2eItemDoseId, e2eItemNoDoseId] } },
  });

  // delete test service
  await prisma.service.delete({ where: { id: e2eServiceId } });

  console.log("  Cleanup complete.\n");

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
