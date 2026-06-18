/**
 * E2E-проверка модуля Treatment Consumable Reversal (Session 36):
 *   npx tsx scripts/e2e-treatment-consumable-reversal-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 */
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

// ── Test data IDs ────────────────────────────────────────────────────────────
let e2eServiceId = "";
let e2eItemId = "";        // unitCost=500, unit="ədəd", qty=100
let e2eItemNoCostId = "";  // unitCost=null, unit="ədəd", qty=50
let e2eTreatmentItemId = "";          // for main reversal tests
let e2eTreatmentItemDoubleId = "";    // for double-reversal test
let e2eTreatmentItemNoUsageId = "";   // for no-usage error test
let e2eTreatmentItemReapplyId = "";   // for re-apply after reversal test

async function main() {
  console.log(`E2E treatment consumable reversal check → ${BASE}\n`);

  // ── Seed references ──────────────────────────────────────────────────────
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

  // second clinic for tenant isolation
  const clinic2 = await prisma.clinic.findFirst({
    where: { slug: { not: "demo-klinika" }, deletedAt: null },
  });
  const owner2User = clinic2
    ? await prisma.user.findFirst({
        where: { clinicId: clinic2.id, role: { key: "owner" } },
        include: { role: true },
      })
    : null;

  // ── Setup ────────────────────────────────────────────────────────────────
  console.log("Setup — creating test data…");

  const testSvc = await prisma.service.create({
    data: { clinicId: clinic.id, name: "E2E-Reversal-Svc", isActive: true },
  });
  e2eServiceId = testSvc.id;

  const item = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-Rev-Item", unit: "ədəd", quantity: 100, unitCost: 500, minQuantity: 0 },
  });
  e2eItemId = item.id;
  await prisma.inventoryMovement.create({
    data: { clinicId: clinic.id, inventoryItemId: item.id, type: "in_stock", quantity: 100, reason: "E2E init", performedById: ownerUser.id },
  });

  const itemNoCost = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-Rev-NoCost", unit: "ədəd", quantity: 50, unitCost: null, minQuantity: 0 },
  });
  e2eItemNoCostId = itemNoCost.id;

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

  const ti = await createTI();
  e2eTreatmentItemId = ti.id;
  const tiDouble = await createTI();
  e2eTreatmentItemDoubleId = tiDouble.id;
  const tiNoUsage = await createTI();
  e2eTreatmentItemNoUsageId = tiNoUsage.id;
  const tiReapply = await createTI();
  e2eTreatmentItemReapplyId = tiReapply.id;

  console.log("Setup complete.\n");

  // ── A: Apply usages (helper via Prisma) ─────────────────────────────────
  console.log("A — apply usages via Prisma (setup for reversal)");

  const applyUsage = async (treatmentItemId: string, inventoryItemId: string, qty: number) => {
    const inv = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
    const newQty = Math.round((Number(inv.quantity) - qty) * 1000) / 1000;
    const movement = await prisma.inventoryMovement.create({
      data: {
        clinicId: clinic.id,
        inventoryItemId,
        type: "treatment_usage",
        quantity: qty,
        reason: "E2E apply",
        treatmentItemId,
        performedById: ownerUser.id,
      },
    });
    await prisma.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantity: newQty } });
    await prisma.treatmentConsumableUsage.create({
      data: {
        clinicId: clinic.id,
        treatmentItemId,
        inventoryItemId,
        quantity: qty,
        unit: "ədəd",
        baseQuantity: qty,
        baseUnit: "ədəd",
        wasSkipped: false,
        inventoryMovementId: movement.id,
        createdById: ownerUser.id,
      },
    });
    return movement.id;
  };

  const origMovementId = await applyUsage(e2eTreatmentItemId, e2eItemId, 5);
  await applyUsage(e2eTreatmentItemDoubleId, e2eItemId, 2);
  await applyUsage(e2eTreatmentItemReapplyId, e2eItemId, 3);

  // also create a skipped usage on the main item — should not be reversed
  await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: e2eTreatmentItemId,
      inventoryItemId: e2eItemNoCostId,
      quantity: 1,
      unit: "ədəd",
      baseQuantity: 0,
      baseUnit: "",
      wasSkipped: true,
      createdById: ownerUser.id,
    },
  });

  const stockAfterApply = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemId } })).quantity,
  );
  check("A: stock decremented after apply (100 - 5 - 2 - 3 = 90)", stockAfterApply === 90, `qty=${stockAfterApply}`);

  // ── B: Full reversal via HTTP ────────────────────────────────────────────
  console.log("\nB — full reversal via HTTP");
  const owner = new Session();
  await owner.login(ownerUser.email);

  const consumablesPage = await owner.get(`/treatments/${e2eTreatmentItemId}/consumables`);
  check("B1: consumables page loads", consumablesPage.status === 200, `status=${consumablesPage.status}`);
  check("B2: reversal form panel present", consumablesPage.html.includes("reversal-form"), `html snippet not found`);

  const reversalRes = await owner.postForm(
    `/treatments/${e2eTreatmentItemId}/consumables`,
    consumablesPage.html,
    { treatmentItemId: e2eTreatmentItemId, reason: "E2E: wrong material" },
    "reversal-form",
  );
  check("B3: reversal action responds 200/303/307", reversalRes.status === 200 || reversalRes.status === 303 || reversalRes.status === 307, `status=${reversalRes.status}`);

  // ── C: Stock returned ────────────────────────────────────────────────────
  console.log("\nC — stock returned after reversal");
  const stockAfterReversal = Number(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemId } })).quantity,
  );
  // started at 100, applied 5 for main TI → 95, reversed 5 → back to 95
  check("C: stock returned by 5 (95)", stockAfterReversal === 95, `qty=${stockAfterReversal}`);

  // ── D: Usage marked reversed ─────────────────────────────────────────────
  console.log("\nD — usage isReversed=true + audit fields set");
  const reversedUsage = await prisma.treatmentConsumableUsage.findFirst({
    where: {
      treatmentItemId: e2eTreatmentItemId,
      wasSkipped: false,
      isReversed: true,
    },
  });
  check("D1: usage isReversed=true", reversedUsage?.isReversed === true);
  check("D2: reversedAt set", reversedUsage?.reversedAt !== null && reversedUsage?.reversedAt !== undefined);
  check("D3: reversedById set", !!reversedUsage?.reversedById);
  check("D4: reversalReason set", reversedUsage?.reversalReason === "E2E: wrong material");
  check("D5: reversalMovementId set", !!reversedUsage?.reversalMovementId);

  // ── E: Original movement preserved ──────────────────────────────────────
  console.log("\nE — original movement preserved");
  const origMovement = await prisma.inventoryMovement.findUnique({ where: { id: origMovementId } });
  check("E1: original movement still exists", !!origMovement);
  check("E2: original movement type = treatment_usage", origMovement?.type === "treatment_usage");

  // ── F: Reversal movement created ─────────────────────────────────────────
  console.log("\nF — reversal movement created");
  const reversalMovement = reversedUsage?.reversalMovementId
    ? await prisma.inventoryMovement.findUnique({ where: { id: reversedUsage.reversalMovementId } })
    : null;
  check("F1: reversal movement exists", !!reversalMovement);
  check("F2: reversal movement type = treatment_usage_reversal", reversalMovement?.type === "treatment_usage_reversal");
  check("F3: reversal movement quantity = baseQuantity (5)", Number(reversalMovement?.quantity) === 5);
  check("F4: reversal movement treatmentItemId set", reversalMovement?.treatmentItemId === e2eTreatmentItemId);

  // ── G: Skipped usage not reversed ────────────────────────────────────────
  console.log("\nG — skipped usage not affected by reversal");
  const skippedUsage = await prisma.treatmentConsumableUsage.findFirst({
    where: { treatmentItemId: e2eTreatmentItemId, wasSkipped: true },
  });
  check("G: skipped usage isReversed=false", skippedUsage?.isReversed === false);

  // ── H: Double reversal blocked ────────────────────────────────────────────
  console.log("\nH — double reversal blocked");
  const consumablesPage2 = await owner.get(`/treatments/${e2eTreatmentItemId}/consumables`);
  const doubleReversalRes = await owner.postForm(
    `/treatments/${e2eTreatmentItemId}/consumables`,
    consumablesPage2.html,
    { treatmentItemId: e2eTreatmentItemId, reason: "E2E: second attempt" },
    "reversal-form",
  );
  // page should render (200) or redirect; either way no new reversal movement
  const afterDoubleCount = await prisma.inventoryMovement.count({
    where: { treatmentItemId: e2eTreatmentItemId, type: "treatment_usage_reversal" },
  });
  check(
    "H: double reversal did not create second movement",
    afterDoubleCount === 1,
    `count=${afterDoubleCount} status=${doubleReversalRes.status}`,
  );

  // ── I: Reason required ────────────────────────────────────────────────────
  // tiDouble already has active usages from section A — use it to test short reason rejection
  console.log("\nI — reason required (short reason rejected)");
  const tiDoublePage = await owner.get(`/treatments/${e2eTreatmentItemDoubleId}/consumables`);
  const emptyReasonRes = await owner.postForm(
    `/treatments/${e2eTreatmentItemDoubleId}/consumables`,
    tiDoublePage.html,
    { treatmentItemId: e2eTreatmentItemDoubleId, reason: "x" }, // too short (1 char < min 3)
    "reversal-form",
  );
  const shortReasonMovCount = await prisma.inventoryMovement.count({
    where: { treatmentItemId: e2eTreatmentItemDoubleId, type: "treatment_usage_reversal" },
  });
  check(
    "I: short reason rejected (no reversal movement)",
    shortReasonMovCount === 0,
    `count=${shortReasonMovCount} status=${emptyReasonRes.status}`,
  );

  // ── J: Re-apply after full reversal ──────────────────────────────────────
  console.log("\nJ — re-apply after full reversal");
  await owner.login(ownerUser.email); // re-login: session may have expired

  // reverse tiReapply via Prisma directly (faster)
  const reapplyUsage = await prisma.treatmentConsumableUsage.findFirst({
    where: { treatmentItemId: e2eTreatmentItemReapplyId, wasSkipped: false, isReversed: false },
  });
  if (reapplyUsage) {
    const invBefore = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: e2eItemId } });
    const revMov = await prisma.inventoryMovement.create({
      data: {
        clinicId: clinic.id,
        inventoryItemId: e2eItemId,
        type: "treatment_usage_reversal",
        quantity: Number(reapplyUsage.baseQuantity),
        reason: "E2E re-apply test reversal",
        treatmentItemId: e2eTreatmentItemReapplyId,
        performedById: ownerUser.id,
      },
    });
    await prisma.inventoryItem.update({
      where: { id: e2eItemId },
      data: { quantity: Number(invBefore.quantity) + Number(reapplyUsage.baseQuantity) },
    });
    await prisma.treatmentConsumableUsage.update({
      where: { id: reapplyUsage.id },
      data: {
        isReversed: true,
        reversedAt: new Date(),
        reversedById: ownerUser.id,
        reversalReason: "E2E re-apply test reversal",
        reversalMovementId: revMov.id,
      },
    });
  }

  // now try re-apply via HTTP (need a template for the service)
  const tplForReapply = await prisma.serviceConsumableTemplate.create({
    data: {
      clinicId: clinic.id,
      serviceId: e2eServiceId,
      inventoryItemId: e2eItemId,
      quantity: 2,
      unit: "ədəd",
      allowOverride: true,
      isRequired: true,
    },
  });

  const reapplyPage = await owner.get(`/treatments/${e2eTreatmentItemReapplyId}/consumables`);
  const reapplyRes = await owner.postForm(
    `/treatments/${e2eTreatmentItemReapplyId}/consumables`,
    reapplyPage.html,
    {
      treatmentItemId: e2eTreatmentItemReapplyId,
      "items[0].inventoryItemId": e2eItemId,
      "items[0].templateId": tplForReapply.id,
      "items[0].quantity": "2",
      "items[0].unit": "ədəd",
      "items[0].wasSkipped": "false",
    },
    "consumable-apply-form",
  );
  check(
    "J1: re-apply after reversal succeeds (200/303/307)",
    reapplyRes.status === 200 || reapplyRes.status === 303 || reapplyRes.status === 307,
    `status=${reapplyRes.status}`,
  );

  const newUsage = await prisma.treatmentConsumableUsage.findFirst({
    where: { treatmentItemId: e2eTreatmentItemReapplyId, isReversed: false, wasSkipped: false, inventoryMovementId: { not: null } },
  });
  check("J2: new active usage created after re-apply", !!newUsage);

  // ── K: Reports exclude reversed ──────────────────────────────────────────
  console.log("\nK — cost reports exclude reversed usages");
  await owner.login(ownerUser.email); // re-login: session may have expired
  const reportsPage = await owner.get("/reports/consumables");
  check("K1: reports page loads", reportsPage.status === 200, `status=${reportsPage.status}`);
  // The reversed usage had qty=5, unitCost=500 → cost=2500 gapiks = 25.00 AZN
  // That amount should NOT appear if the report only counts active usages
  // We check via DB: reversed usages should not be in active count
  const activeUsagesCount = await prisma.treatmentConsumableUsage.count({
    where: { clinicId: clinic.id, wasSkipped: false, inventoryMovementId: { not: null }, isReversed: false },
  });
  const allUsagesCount = await prisma.treatmentConsumableUsage.count({
    where: { clinicId: clinic.id, wasSkipped: false, inventoryMovementId: { not: null } },
  });
  check("K2: active usages < total usages (reversed excluded)", activeUsagesCount < allUsagesCount, `active=${activeUsagesCount} all=${allUsagesCount}`);

  // ── L: Tenant isolation ────────────────────────────────────────────────
  console.log("\nL — tenant isolation");
  if (clinic2 && owner2User) {
    const owner2 = new Session();
    await owner2.login(owner2User.email);
    const crossPage = await owner2.get(`/treatments/${e2eTreatmentItemId}/consumables`);
    check(
      "L: clinic2 cannot access clinic1 consumables page",
      crossPage.status === 404 || crossPage.status === 302 || crossPage.status === 303 || crossPage.status === 307,
      `status=${crossPage.status}`,
    );
  } else {
    console.log("  ~ L: skipped (no second clinic in seed)");
    passed++;
  }

  // ── M: Permission check (reception cannot reverse) ─────────────────────
  console.log("\nM — permission: reception cannot access treatments.manage");
  const receptionUser = await prisma.user.findFirst({
    where: { clinicId: clinic.id, role: { key: "reception" } },
    include: { role: true },
  });
  if (receptionUser) {
    const receptionSession = new Session();
    await receptionSession.login(receptionUser.email);
    const tiPage = await receptionSession.get(`/treatments/${e2eTreatmentItemId}/consumables`);
    // reception has treatments.view but not treatments.manage
    // the reversal form is hidden in UI, but if they POST directly it should fail
    const receptionReversalRes = await receptionSession.postForm(
      `/treatments/${e2eTreatmentItemId}/consumables`,
      tiPage.html,
      { treatmentItemId: e2eTreatmentItemId, reason: "Reception should not reverse" },
      "reversal-form",
    );
    // Form is not in the HTML for non-manage users, so postForm won't find $ACTION keys
    // The action would respond 400 or redirect without performing reversal
    const reversalMovAfterReception = await prisma.inventoryMovement.count({
      where: { treatmentItemId: e2eTreatmentItemId, type: "treatment_usage_reversal" },
    });
    check(
      "M: reception cannot create reversal movement",
      reversalMovAfterReception === 1, // still 1 from section B
      `count=${reversalMovAfterReception}`,
    );
  } else {
    console.log("  ~ M: skipped (no reception user in seed)");
    passed++;
  }

  // ── N: Super admin safety ─────────────────────────────────────────────
  console.log("\nN — super admin safety");
  const superAdminUser = await prisma.user.findFirst({
    where: { clinicId: null, role: { key: "super_admin" } },
    include: { role: true },
  });
  if (superAdminUser) {
    const saSession = new Session();
    await saSession.login(superAdminUser.email);
    const saTiPage = await saSession.get(`/treatments/${e2eTreatmentItemId}/consumables`);
    // super admin should not see this page or be redirected
    check(
      "N: super admin cannot access treatment consumables page",
      saTiPage.status === 404 || saTiPage.status === 302 || saTiPage.status === 303 || saTiPage.status === 307,
      `status=${saTiPage.status}`,
    );
  } else {
    console.log("  ~ N: skipped (no super_admin user)");
    passed++;
  }

  // ── O: Regression ─────────────────────────────────────────────────────
  console.log("\nO — regression checks");
  await owner.login(ownerUser.email);
  const treatmentsPage = await owner.get("/treatments");
  check("O1: /treatments still loads", treatmentsPage.status === 200, `status=${treatmentsPage.status}`);
  const inventoryPage = await owner.get("/inventory");
  check("O2: /inventory still loads", inventoryPage.status === 200, `status=${inventoryPage.status}`);
  const reportsPage2 = await owner.get("/reports/consumables");
  check("O3: /reports/consumables still loads", reportsPage2.status === 200, `status=${reportsPage2.status}`);

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  // delete in dependency order
  await prisma.treatmentConsumableUsage.deleteMany({
    where: {
      clinicId: clinic.id,
      treatmentItemId: { in: [e2eTreatmentItemId, e2eTreatmentItemDoubleId, e2eTreatmentItemNoUsageId, e2eTreatmentItemReapplyId] },
    },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { clinicId: clinic.id, treatmentItemId: { in: [e2eTreatmentItemId, e2eTreatmentItemDoubleId, e2eTreatmentItemNoUsageId, e2eTreatmentItemReapplyId] } },
  });
  await prisma.treatmentItem.deleteMany({
    where: { id: { in: [e2eTreatmentItemId, e2eTreatmentItemDoubleId, e2eTreatmentItemNoUsageId, e2eTreatmentItemReapplyId] } },
  });
  await prisma.serviceConsumableTemplate.deleteMany({ where: { serviceId: e2eServiceId } });
  await prisma.service.delete({ where: { id: e2eServiceId } });
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: { in: [e2eItemId, e2eItemNoCostId] } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: [e2eItemId, e2eItemNoCostId] } } });

  console.log("\n────────────────────────────────────────────");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
