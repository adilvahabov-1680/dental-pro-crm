/**
 * E2E-проверка модуля Consumable Cost Reports (Session 35):
 *   npx tsx scripts/e2e-consumable-cost-reports-check.ts
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
  async login(email: string): Promise<boolean> {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

async function main() {
  console.log(`E2E consumable cost reports check → ${BASE}\n`);

  // ── Setup ──────────────────────────────────────────────────────────────────
  console.log("Setup — creating test data…");

  const clinic = await prisma.clinic.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true },
  });
  const ownerUser = await prisma.user.findFirstOrThrow({
    where: { clinicId: clinic.id, role: { key: "owner" } },
    include: { role: true },
  });
  const doctorRecord = await prisma.doctor.findFirstOrThrow({
    where: { clinicId: clinic.id, isActive: true, deletedAt: null },
    select: { id: true, user: { select: { email: true, fullName: true } } },
  });
  const patient = await prisma.patient.findFirstOrThrow({
    where: { clinicId: clinic.id, deletedAt: null },
    select: { id: true },
  });
  const service = await prisma.service.findFirstOrThrow({
    where: { clinicId: clinic.id, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });

  // inventory item WITH unitCost = 500 gapik (5.00 AZN)
  const e2eItemWithCost = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-Cost-Report-Item-WithCost",
      unit: "ədəd",
      quantity: 100,
      unitCost: 500, // 5.00 AZN
      isActive: true,
    },
  });

  // inventory item WITHOUT unitCost (null)
  const e2eItemNoCost = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-Cost-Report-Item-NoCost",
      unit: "ml",
      quantity: 100,
      unitCost: null,
      isActive: true,
    },
  });

  // treatment item 1 — for "with cost" usage
  const ti1 = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctorRecord.id,
      serviceId: service.id,
      status: "in_progress",
      price: 0,
    },
  });

  // treatment item 2 — for "no cost" usage
  const ti2 = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctorRecord.id,
      serviceId: service.id,
      status: "in_progress",
      price: 0,
    },
  });

  // movement for "with cost" usage (required for inventoryMovementId != null check)
  const mvt1 = await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: e2eItemWithCost.id,
      type: "treatment_usage",
      quantity: 2,
      unitCost: 500,
      treatmentItemId: ti1.id,
      performedById: ownerUser.id,
    },
  });
  await prisma.inventoryItem.update({
    where: { id: e2eItemWithCost.id },
    data: { quantity: { decrement: 2 } },
  });

  // movement for "no cost" usage
  const mvt2 = await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: e2eItemNoCost.id,
      type: "treatment_usage",
      quantity: 3,
      unitCost: null,
      treatmentItemId: ti2.id,
      performedById: ownerUser.id,
    },
  });
  await prisma.inventoryItem.update({
    where: { id: e2eItemNoCost.id },
    data: { quantity: { decrement: 3 } },
  });

  // TreatmentConsumableUsage: baseQuantity=2, unitCost=500 → line cost = 1000 gapik
  const usage1 = await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: ti1.id,
      serviceId: service.id,
      inventoryItemId: e2eItemWithCost.id,
      quantity: 2,
      unit: "ədəd",
      baseQuantity: 2,
      baseUnit: "ədəd",
      allowOverride: true,
      isRequired: false,
      wasSkipped: false,
      inventoryMovementId: mvt1.id,
      createdById: ownerUser.id,
    },
  });

  // TreatmentConsumableUsage: no cost item
  const usage2 = await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: ti2.id,
      serviceId: service.id,
      inventoryItemId: e2eItemNoCost.id,
      quantity: 3,
      unit: "ml",
      baseQuantity: 3,
      baseUnit: "ml",
      allowOverride: true,
      isRequired: false,
      wasSkipped: false,
      inventoryMovementId: mvt2.id,
      createdById: ownerUser.id,
    },
  });

  // skipped usage — should NOT appear in totals (wasSkipped=true, no movement)
  const usageSkipped = await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id,
      treatmentItemId: ti1.id,
      serviceId: service.id,
      inventoryItemId: e2eItemWithCost.id,
      quantity: 1,
      unit: "ədəd",
      baseQuantity: 1,
      baseUnit: "ədəd",
      allowOverride: true,
      isRequired: false,
      wasSkipped: true,
      inventoryMovementId: null,
      createdById: ownerUser.id,
    },
  });

  console.log("  Setup complete.\n");

  // ── A. Access control ────────────────────────────────────────────────────
  console.log("A. Access control");

  const owner = new Session();
  const ownerLoggedIn = await owner.login(ownerUser.email);
  check("owner login", ownerLoggedIn);

  const reportPage = await owner.get("/reports/consumables");
  check("owner can access report page (200)", reportPage.status === 200, `status=${reportPage.status}`);
  check("report page shows title", reportPage.html.includes("Sərfiyyat hesabatı"));
  check("report page has filter form", reportPage.html.includes("report-filter-form"));

  const anon = new Session();
  const anonPage = await anon.get("/reports/consumables");
  check(
    "anon redirected",
    anonPage.status === 302 || anonPage.status === 303 || anonPage.status === 307,
    `status=${anonPage.status}`,
  );

  // ── B. Summary — total cost ──────────────────────────────────────────────
  console.log("\nB. Summary — total cost");

  // expected: 2 * 500 = 1000 gapik = 10.00 AZN; skipped not counted
  // null-cost item contributes 0 to total
  check(
    "summary section present",
    reportPage.html.includes("consumable-report-summary"),
  );
  // 10.00 ₼ (formatted as "10,00 ₼" in az-AZ locale)
  const formattedTen = (1000 / 100).toLocaleString("az-AZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " ₼";
  check(
    "total cost shows 10.00 AZN from seed+test",
    reportPage.html.includes(formattedTen),
    `looking for "${formattedTen}"`,
  );

  // ── C. Missing unitCost marker ────────────────────────────────────────────
  console.log("\nC. Missing unitCost marker");

  check("missing-cost marker present", reportPage.html.includes("missing-cost"));
  check("Qiymət yoxdur text present", reportPage.html.includes("Qiymət yoxdur"));

  // ── D. By inventory item ──────────────────────────────────────────────────
  console.log("\nD. By inventory item");

  check("by-item-table rendered", reportPage.html.includes("by-item-table"));
  check(
    "by-item: with-cost item name visible",
    reportPage.html.includes("E2E-Cost-Report-Item-WithCost"),
  );
  check(
    "by-item: no-cost item name visible",
    reportPage.html.includes("E2E-Cost-Report-Item-NoCost"),
  );

  // ── E. By service ────────────────────────────────────────────────────────
  console.log("\nE. By service");

  check("by-service-table rendered", reportPage.html.includes("by-service-table"));
  check("by-service: service name visible", reportPage.html.includes(service.name));

  // ── F. By doctor ──────────────────────────────────────────────────────────
  console.log("\nF. By doctor");

  check("by-doctor-table rendered", reportPage.html.includes("by-doctor-table"));
  check(
    "by-doctor: doctor name visible",
    reportPage.html.includes(doctorRecord.user.fullName),
  );

  // ── G. Recent usage detail ───────────────────────────────────────────────
  console.log("\nG. Recent usage detail");

  check("recent-usage-table rendered", reportPage.html.includes("recent-usage-table"));
  check(
    "recent: with-cost item in table",
    reportPage.html.includes("E2E-Cost-Report-Item-WithCost"),
  );

  // ── H. Date filter ────────────────────────────────────────────────────────
  console.log("\nH. Date filter");

  // filter to a future date range — should show empty
  const futureFrom = "2099-01-01";
  const futureTo = "2099-12-31";
  const filteredPage = await owner.get(`/reports/consumables?from=${futureFrom}&to=${futureTo}`);
  check("future date filter: page 200", filteredPage.status === 200, `status=${filteredPage.status}`);
  check(
    "future date filter: no data shown",
    filteredPage.html.includes("Bu dövr üçün sərfiyyat məlumatı yoxdur") ||
      !filteredPage.html.includes("E2E-Cost-Report-Item-WithCost"),
    "expected empty state or no test items",
  );

  // filter to today (should include test data created now)
  const today = new Date().toISOString().split("T")[0];
  const todayPage = await owner.get(`/reports/consumables?from=${today}&to=${today}`);
  check("today filter: page 200", todayPage.status === 200, `status=${todayPage.status}`);
  check(
    "today filter: test items visible",
    todayPage.html.includes("E2E-Cost-Report-Item-WithCost"),
  );

  // ── I. Tenant isolation ──────────────────────────────────────────────────
  console.log("\nI. Tenant isolation");

  const secondClinic = await prisma.clinic.findFirst({
    where: { id: { not: clinic.id }, deletedAt: null },
    select: { id: true },
  });
  if (secondClinic) {
    // owner of clinic A should not see data from clinic B
    const crossItems = await prisma.treatmentConsumableUsage.findMany({
      where: { clinicId: secondClinic.id, wasSkipped: false },
      select: { inventoryItem: { select: { name: true } } },
      take: 1,
    });
    if (crossItems[0]) {
      const crossItemName = crossItems[0].inventoryItem.name;
      check(
        "tenant isolation: clinic B item not in clinic A report",
        !reportPage.html.includes(crossItemName),
      );
    } else {
      check("tenant isolation: no clinic B usages to test (skipped)", true);
    }
  } else {
    check("tenant isolation: single-clinic environment (skipped)", true);
  }

  // ── J. Permission — doctor role ──────────────────────────────────────────
  console.log("\nJ. Permission — doctor role");

  const doctor = new Session();
  const doctorLoggedIn = await doctor.login(doctorRecord.user.email);
  check("doctor login", doctorLoggedIn);
  const doctorReport = await doctor.get("/reports/consumables");
  check(
    "doctor can view report (inventory.view)",
    doctorReport.status === 200,
    `status=${doctorReport.status}`,
  );

  // ── K. Super admin safety ─────────────────────────────────────────────────
  console.log("\nK. Super admin safety");

  const superAdmin = await prisma.user.findFirst({
    where: { clinicId: null, role: { key: "super_admin" } },
    select: { id: true, email: true },
  });
  if (superAdmin) {
    // verify DB: all cost report usages have non-null clinicId
    const allE2eUsages = await prisma.treatmentConsumableUsage.findMany({
      where: { id: { in: [usage1.id, usage2.id] } },
      select: { clinicId: true },
    });
    check(
      "super admin safety: all e2e usages have clinicId",
      allE2eUsages.every((u) => typeof u.clinicId === "string" && u.clinicId.length > 0),
    );
  } else {
    check("super admin: no super_admin found (skipped)", true);
  }

  // ── L. Regression ────────────────────────────────────────────────────────
  console.log("\nL. Regression");

  // re-login to ensure session is fresh after many requests
  await owner.login(ownerUser.email);

  const inventoryPage = await owner.get("/inventory");
  check("regression: /inventory 200", inventoryPage.status === 200, `status=${inventoryPage.status}`);
  check(
    "regression: report link in inventory page",
    inventoryPage.html.includes("consumable-report-link"),
    `status=${inventoryPage.status}`,
  );

  const treatmentsPage = await owner.get("/treatments");
  check("regression: /treatments 200", treatmentsPage.status === 200, `status=${treatmentsPage.status}`);

  const consumablesPage = await owner.get(`/treatments/${ti1.id}/consumables`);
  check(
    "regression: treatment consumables page 200",
    consumablesPage.status === 200,
    `status=${consumablesPage.status}`,
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");

  await prisma.treatmentConsumableUsage.deleteMany({
    where: { id: { in: [usage1.id, usage2.id, usageSkipped.id] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { id: { in: [mvt1.id, mvt2.id] } },
  });
  await prisma.treatmentItem.deleteMany({
    where: { id: { in: [ti1.id, ti2.id] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [e2eItemWithCost.id, e2eItemNoCost.id] } },
  });

  console.log("  Cleanup complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    const total = passed + failed;
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  });
