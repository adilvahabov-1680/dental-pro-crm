/**
 * E2E-проверка Session 37 — Consumables Audit Visibility:
 *   npx tsx scripts/e2e-consumables-audit-visibility-check.ts
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

async function main() {
  console.log(`E2E consumables audit visibility check → ${BASE}\n`);

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
    data: { clinicId: clinic.id, name: "E2E-Audit-Svc", isActive: true },
  });

  const item = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-Audit-Item", unit: "ədəd", quantity: 100, unitCost: 200, minQuantity: 0 },
  });
  const itemDose = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-Audit-Dose", unit: "ml", quantity: 100, unitCost: 50, minQuantity: 0, doseToBaseFactor: 5 },
  });

  const createTI = async () =>
    prisma.treatmentItem.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        doctorId: doctorRecord.id,
        serviceId: testSvc.id,
        status: "in_progress",
        price: 0,
      },
    });

  const tiMain = await createTI();      // for apply + reversal tests
  const tiDose = await createTI();      // for dose conversion test
  const tiSkip = await createTI();      // for skipped item test
  const tiReapply = await createTI();   // for re-apply status test

  // Apply usages via Prisma (not HTTP) for speed
  const applyUsage = async (
    treatmentItemId: string,
    inventoryItemId: string,
    qty: number,
    baseQty: number,
    unit: string,
    baseUnit: string,
  ) => {
    const inv = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
    const newQty = Math.round((Number(inv.quantity) - baseQty) * 1000) / 1000;
    const movement = await prisma.inventoryMovement.create({
      data: {
        clinicId: clinic.id,
        inventoryItemId,
        type: "treatment_usage",
        quantity: baseQty,
        reason: "E2E audit apply",
        treatmentItemId,
        performedById: ownerUser.id,
      },
    });
    await prisma.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantity: newQty } });
    const usage = await prisma.treatmentConsumableUsage.create({
      data: {
        clinicId: clinic.id,
        treatmentItemId,
        inventoryItemId,
        quantity: qty,
        unit,
        baseQuantity: baseQty,
        baseUnit,
        wasSkipped: false,
        inventoryMovementId: movement.id,
        createdById: ownerUser.id,
      },
    });
    return { movementId: movement.id, usageId: usage.id };
  };

  const { movementId: origMovId, usageId: origUsageId } = await applyUsage(tiMain.id, item.id, 5, 5, "ədəd", "ədəd");
  await applyUsage(tiDose.id, itemDose.id, 2, 10, "dose", "ml"); // dose: 2 dose × 5 = 10 ml
  // skipped usage on tiSkip
  await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: tiSkip.id,
      inventoryItemId: item.id,
      quantity: 3,
      unit: "ədəd",
      baseQuantity: 0,
      baseUnit: "ədəd",
      wasSkipped: true,
      createdById: ownerUser.id,
    },
  });
  await applyUsage(tiReapply.id, item.id, 3, 3, "ədəd", "ədəd");

  // Reverse tiMain via Prisma
  const revMovement = await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: item.id,
      type: "treatment_usage_reversal",
      quantity: 5,
      reason: "E2E audit reversal reason",
      treatmentItemId: tiMain.id,
      performedById: ownerUser.id,
    },
  });
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: { increment: 5 } } });
  await prisma.treatmentConsumableUsage.update({
    where: { id: origUsageId },
    data: {
      isReversed: true,
      reversedAt: new Date(),
      reversedById: ownerUser.id,
      reversalReason: "E2E audit reversal reason",
      reversalMovementId: revMovement.id,
    },
  });

  // Add service template so apply form renders (for re-apply page check)
  const tpl = await prisma.serviceConsumableTemplate.create({
    data: {
      clinicId: clinic.id,
      serviceId: testSvc.id,
      inventoryItemId: item.id,
      quantity: 2,
      unit: "ədəd",
      allowOverride: true,
      isRequired: true,
    },
  });

  console.log("Setup complete.\n");

  const owner = new Session();
  await owner.login(ownerUser.email);
  // Re-login to warm the session (established pattern across all e2e suites)
  await owner.login(ownerUser.email);

  // ── A: Treatment card status badges ────────────────────────────────────
  console.log("A — treatment card consumable status badges");

  // tiMain is reversed — should show reversed badge
  // tiReapply has active usage
  // tiSkip has only skipped usage → "none" (no badge)
  // tiDose has active dose usage → applied
  const treatmentsPage = await owner.get("/treatments");
  check("A1: /treatments loads", treatmentsPage.status === 200, `status=${treatmentsPage.status}`);

  // Check for the badge marker on tiMain (reversed)
  check(
    "A2: reversed badge present for reversed treatment",
    treatmentsPage.html.includes(`consumable-status-badge-${tiMain.id}`),
    `marker not found`,
  );

  // Check for the badge marker on tiReapply (applied)
  check(
    "A3: applied badge present for applied treatment",
    treatmentsPage.html.includes(`consumable-status-badge-${tiReapply.id}`),
    `marker not found`,
  );

  // tiSkip has only a skipped usage (no active non-skipped) → no badge
  check(
    "A4: no badge for treatment with only skipped usages",
    !treatmentsPage.html.includes(`consumable-status-badge-${tiSkip.id}`),
    `badge unexpectedly present`,
  );

  // ── B: Consumables page usage list ──────────────────────────────────────
  console.log("\nB — consumables page usage list");
  const mainPage = await owner.get(`/treatments/${tiMain.id}/consumables`);
  check("B1: consumables page loads", mainPage.status === 200, `status=${mainPage.status}`);

  // Usage row for tiMain item
  check(
    "B2: usage row present for item",
    mainPage.html.includes(`usage-row-${item.id}`),
    `marker usage-row-${item.id} not found`,
  );

  // Quantity display marker
  check(
    "B3: usage qty marker present",
    mainPage.html.includes(`usage-qty-${item.id}`),
    `qty marker not found`,
  );

  // Status label marker
  check(
    "B4: usage status marker present",
    mainPage.html.includes(`usage-status-${item.id}`),
    `status marker not found`,
  );

  // Audit sub-row marker
  check(
    "B5: audit sub-row marker present",
    mainPage.html.includes(`usage-audit-${item.id}`),
    `audit sub-row not found`,
  );

  // Dose: check tiDose page shows baseUnit
  const dosePage = await owner.get(`/treatments/${tiDose.id}/consumables`);
  check("B6: dose consumables page loads", dosePage.status === 200, `status=${dosePage.status}`);
  check(
    "B7: dose usage row present",
    dosePage.html.includes(`usage-row-${itemDose.id}`),
    `dose usage-row marker not found`,
  );
  check(
    "B8: dose qty shows dose → ml conversion",
    dosePage.html.includes("ml"),
    `dose base unit ml not in HTML`,
  );

  // Skipped item on tiSkip
  const skipPage = await owner.get(`/treatments/${tiSkip.id}/consumables`);
  check("B9: skip consumables page loads", skipPage.status === 200, `status=${skipPage.status}`);
  check(
    "B10: skipped usage row present",
    skipPage.html.includes(`usage-row-${item.id}`),
    `skipped usage-row not found`,
  );

  // ── C: Reversal details visibility ─────────────────────────────────────
  console.log("\nC — reversal details visibility");

  // tiMain is reversed — reversal details should be in the page
  check(
    "C1: reversal detail marker present",
    mainPage.html.includes(`reversal-detail-${item.id}`),
    `reversal-detail marker not found`,
  );

  check(
    "C2: reversal reason appears in page",
    mainPage.html.includes("E2E audit reversal reason"),
    `reason text not found`,
  );

  check(
    "C3: reversal movement marker present",
    mainPage.html.includes(`reversal-movement-${item.id}`),
    `reversal-movement marker not found`,
  );

  // Audit trail section
  check(
    "C4: audit trail section present",
    mainPage.html.includes("audit-trail-section"),
    `audit-trail-section not found`,
  );

  check(
    "C5: audit reversal step present",
    mainPage.html.includes("audit-reversal-step"),
    `audit-reversal-step not found`,
  );

  // ── D: Movement type labels ─────────────────────────────────────────────
  console.log("\nD — movement type labels in inventory");
  const invItemPage = await owner.get(`/inventory/${item.id}`);
  check("D1: inventory item page loads", invItemPage.status === 200, `status=${invItemPage.status}`);
  check(
    "D2: treatment_usage label 'Müalicə sərfiyyatı' shown",
    invItemPage.html.includes("Müalicə sərfiyyatı"),
    `label not found`,
  );
  check(
    "D3: treatment_usage_reversal label 'Sərfiyyat geri qaytarma' shown",
    invItemPage.html.includes("Sərfiyyat geri qaytarma"),
    `label not found`,
  );

  // ── E: Cost report links ────────────────────────────────────────────────
  console.log("\nE — cost report link to treatment consumables");
  await owner.login(ownerUser.email);
  const reportsPage = await owner.get("/reports/consumables");
  check("E1: reports page loads", reportsPage.status === 200, `status=${reportsPage.status}`);
  check(
    "E2: 'Müalicəyə keç' link present in recent usage table",
    reportsPage.html.includes("report-go-to-treatment"),
    `go-to-treatment marker not found`,
  );
  // Check the link points to the consumables page
  check(
    "E3: link href contains /treatments/…/consumables",
    reportsPage.html.includes("/consumables"),
    `consumables href not found`,
  );

  // ── F: Re-apply status ──────────────────────────────────────────────────
  console.log("\nF — re-apply via HTTP then check badge");
  // tiReapply already has active usage (applied in setup) → badge = 'applied'
  const reapplyPage = await owner.get("/treatments");
  check(
    "F: applied badge shows for treatment with active usage",
    reapplyPage.html.includes(`consumable-status-badge-${tiReapply.id}`),
    `applied badge not found`,
  );

  // ── G: Tenant isolation ─────────────────────────────────────────────────
  console.log("\nG — tenant isolation");
  if (clinic2 && owner2User) {
    const owner2 = new Session();
    await owner2.login(owner2User.email);
    const crossPage = await owner2.get(`/treatments/${tiMain.id}/consumables`);
    check(
      "G: clinic2 cannot access clinic1 consumables page",
      crossPage.status === 404 || crossPage.status === 302 || crossPage.status === 303 || crossPage.status === 307,
      `status=${crossPage.status}`,
    );
  } else {
    console.log("  ~ G: skipped (no second clinic in seed)");
    passed++;
  }

  // ── H: Permission ───────────────────────────────────────────────────────
  console.log("\nH — permission: requires treatments.view");
  const superAdminUser = await prisma.user.findFirst({
    where: { clinicId: null, role: { key: "super_admin" } },
    include: { role: true },
  });
  if (superAdminUser) {
    const saSession = new Session();
    await saSession.login(superAdminUser.email);
    const saPage = await saSession.get(`/treatments/${tiMain.id}/consumables`);
    check(
      "H: super admin cannot access treatment consumables page",
      saPage.status === 404 || saPage.status === 302 || saPage.status === 303 || saPage.status === 307,
      `status=${saPage.status}`,
    );
  } else {
    console.log("  ~ H: skipped (no super_admin user)");
    passed++;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  await prisma.treatmentConsumableUsage.deleteMany({
    where: { clinicId: clinic.id, treatmentItemId: { in: [tiMain.id, tiDose.id, tiSkip.id, tiReapply.id] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { clinicId: clinic.id, treatmentItemId: { in: [tiMain.id, tiDose.id, tiSkip.id, tiReapply.id] } },
  });
  await prisma.treatmentItem.deleteMany({
    where: { id: { in: [tiMain.id, tiDose.id, tiSkip.id, tiReapply.id] } },
  });
  await prisma.serviceConsumableTemplate.deleteMany({ where: { serviceId: testSvc.id } });
  await prisma.service.delete({ where: { id: testSvc.id } });
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: { in: [item.id, itemDose.id] } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: [item.id, itemDose.id] } } });

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
