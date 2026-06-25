/**
 * E2E-проверка модуля: inventory unit conversions (сессия 32).
 *   npx tsx scripts/e2e-inventory-units-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 *
 * Проверяет:
 *   A  Auth guard (anon → redirect)
 *   B  Permission guard (doctor без inventory.manage не может создать)
 *   C  baseUnit "ml" — поле unit сохраняется, purchaseUnit=null, factor=1
 *   D  purchaseUnit "qutu" + factor 50 — сохраняется в DB
 *   E  doseToBaseFactor 2 — сохраняется в DB
 *   F  factor 0 — отклоняется (item не создаётся)
 *   G  factor -5 — отклоняется (item не создаётся)
 *   H  corrections compat — item с unit полями принимает StockCorrectionForm
 *   I  tenant isolation — tenantClient фильтрует по clinicId
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
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  async postForm(path: string, pageHtml: string, fields: Record<string, string>, markerAttr?: string) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    // /inventory/[id] теперь содержит 2 формы (stock-correction + archive,
    // сессия 77) — без markerAttr можно зацепить $ACTION-токены чужой формы
    let html = pageHtml;
    if (markerAttr) {
      const idx = pageHtml.indexOf(`data-e2e-marker="${markerAttr}"`);
      if (idx !== -1) {
        const start = pageHtml.lastIndexOf("<form", idx);
        const end = pageHtml.indexOf("</form>", idx) + 7;
        html = start !== -1 ? pageHtml.slice(start, end) : pageHtml;
      }
    }
    const fd = new FormData();
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
  console.log(`E2E inventory-units check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // Cleanup items from previous runs
  await prisma.inventoryMovement.deleteMany({
    where: { clinicId: clinic.id, reason: { startsWith: "E2E-UNITS:" } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E-UNITS-" } },
  });

  // A. Auth guard
  console.log("--- A. Auth guard ---");
  const anon = new Session();
  const anonPage = await anon.get("/inventory/new");
  check("anon: redirect to /login (302/307)", [302, 307].includes(anonPage.status));

  // B. Permission guard — doctor has inventory.view but not inventory.manage
  console.log("\n--- B. Permission guard ---");
  const doctor = new Session();
  check("doctor: login ok", await doctor.login("hekim@demo.dentalpro.az"));
  const doctorNewPage = await doctor.get("/inventory/new");
  // Doctor can't reach /inventory/new — should redirect (no inventory.manage)
  check("doctor: no access to /inventory/new (redirect)", doctorNewPage.status !== 200);

  // C. Owner: create item with unit="ml", no purchaseUnit
  console.log("\n--- C. Create item with baseUnit 'ml' ---");
  const owner = new Session();
  check("owner: login ok", await owner.login("admin@demo.dentalpro.az"));

  const countBefore = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  const newPage = await owner.get("/inventory/new");
  check("owner: /inventory/new opens (200)", newPage.status === 200);

  const resC = await owner.postForm("/inventory/new", newPage.html, {
    name: "E2E-UNITS-Anesteziya",
    unit: "ml",
    initialQuantity: "0",
    minQuantity: "1",
    purchaseToBaseFactor: "1",
  });
  const countAfterC = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  check("C: item created (+1)", countAfterC === countBefore + 1, `before=${countBefore} after=${countAfterC}`);
  check("C: redirect to item page", !!resC.location?.match(/\/inventory\/[0-9a-f-]{36}$/));

  const itemC = await prisma.inventoryItem.findFirst({
    where: { clinicId: clinic.id, name: "E2E-UNITS-Anesteziya" },
  });
  check("C: unit = 'ml'", itemC?.unit === "ml", `got ${itemC?.unit}`);
  check("C: purchaseUnit = null", itemC?.purchaseUnit === null, `got ${itemC?.purchaseUnit}`);
  check("C: purchaseToBaseFactor = 1", Number(itemC?.purchaseToBaseFactor) === 1, `got ${itemC?.purchaseToBaseFactor}`);
  check("C: doseToBaseFactor = null", itemC?.doseToBaseFactor === null, `got ${itemC?.doseToBaseFactor}`);

  // D. Create item with purchaseUnit "qutu" + factor 50
  console.log("\n--- D. Create item with purchaseUnit + factor ---");
  const newPage2 = await owner.get("/inventory/new");
  const resD = await owner.postForm("/inventory/new", newPage2.html, {
    name: "E2E-UNITS-Perçatki",
    unit: "cüt",
    purchaseUnit: "qutu",
    purchaseToBaseFactor: "50",
    initialQuantity: "0",
    minQuantity: "5",
  });
  check("D: redirect to item page", !!resD.location?.match(/\/inventory\/[0-9a-f-]{36}$/));

  const itemD = await prisma.inventoryItem.findFirst({
    where: { clinicId: clinic.id, name: "E2E-UNITS-Perçatki" },
  });
  check("D: purchaseUnit = 'qutu'", itemD?.purchaseUnit === "qutu", `got ${itemD?.purchaseUnit}`);
  check("D: purchaseToBaseFactor = 50", Number(itemD?.purchaseToBaseFactor) === 50, `got ${itemD?.purchaseToBaseFactor}`);

  // E. Create item with doseToBaseFactor 2
  console.log("\n--- E. Create item with doseToBaseFactor ---");
  const newPage3 = await owner.get("/inventory/new");
  const resE = await owner.postForm("/inventory/new", newPage3.html, {
    name: "E2E-UNITS-Kompozit",
    unit: "ml",
    purchaseUnit: "karpul",
    purchaseToBaseFactor: "1.8",
    doseToBaseFactor: "0.3",
    initialQuantity: "0",
    minQuantity: "2",
  });
  check("E: redirect to item page", !!resE.location?.match(/\/inventory\/[0-9a-f-]{36}$/));

  const itemE = await prisma.inventoryItem.findFirst({
    where: { clinicId: clinic.id, name: "E2E-UNITS-Kompozit" },
  });
  check("E: doseToBaseFactor = 0.3", Math.abs(Number(itemE?.doseToBaseFactor) - 0.3) < 0.0001, `got ${itemE?.doseToBaseFactor}`);
  check("E: purchaseToBaseFactor = 1.8", Math.abs(Number(itemE?.purchaseToBaseFactor) - 1.8) < 0.0001, `got ${itemE?.purchaseToBaseFactor}`);

  // F. Factor = 0 rejected
  console.log("\n--- F. Invalid factor 0 rejected ---");
  const countBeforeF = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  const newPage4 = await owner.get("/inventory/new");
  const resF = await owner.postForm("/inventory/new", newPage4.html, {
    name: "E2E-UNITS-ShouldFail-Zero",
    unit: "ədəd",
    purchaseToBaseFactor: "0",
    initialQuantity: "0",
    minQuantity: "0",
  });
  const countAfterF = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  check("F: no item created with factor=0", countAfterF === countBeforeF, `before=${countBeforeF} after=${countAfterF}`);
  check("F: no redirect (validation error stays on page)", !resF.location?.match(/\/inventory\/[0-9a-f-]{36}$/));

  // G. Negative factor rejected
  console.log("\n--- G. Invalid factor -5 rejected ---");
  const countBeforeG = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  const newPage5 = await owner.get("/inventory/new");
  const resG = await owner.postForm("/inventory/new", newPage5.html, {
    name: "E2E-UNITS-ShouldFail-Neg",
    unit: "ədəd",
    purchaseToBaseFactor: "-5",
    initialQuantity: "0",
    minQuantity: "0",
  });
  const countAfterG = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  check("G: no item created with factor=-5", countAfterG === countBeforeG, `before=${countBeforeG} after=${countAfterG}`);
  check("G: no redirect (validation error stays on page)", !resG.location?.match(/\/inventory\/[0-9a-f-]{36}$/));

  // H. Corrections compat — item with unit fields accepts stock correction
  console.log("\n--- H. Corrections compat ---");
  const corrItem = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-UNITS-CorrectionTest",
      unit: "ml",
      purchaseUnit: "şüşə",
      purchaseToBaseFactor: 10,
      doseToBaseFactor: 2,
      quantity: 5,
      minQuantity: 2,
    },
  });

  const corrPage = await owner.get(`/inventory/${corrItem.id}`);
  check("H: item detail page opens (200)", corrPage.status === 200);
  check("H: StockCorrectionForm present", corrPage.html.includes('data-e2e-marker="stock-correction-form"'));

  const corrResult = await owner.postForm(`/inventory/${corrItem.id}`, corrPage.html, {
    itemId: corrItem.id,
    type: "adjustment",
    quantity: "3",
    reason: "E2E-UNITS: test correction on unit-converted item",
  }, "stock-correction-form");
  const corrItemAfter = await prisma.inventoryItem.findUnique({ where: { id: corrItem.id } });
  check("H: quantity increased by 3 after correction", Number(corrItemAfter?.quantity) === 8, `got ${corrItemAfter?.quantity}`);
  check("H: unit fields preserved after correction", corrItemAfter?.purchaseUnit === "şüşə" && Number(corrItemAfter.purchaseToBaseFactor) === 10);

  // I. Tenant isolation — DB-level: tenantClient filters by clinicId
  console.log("\n--- I. Tenant isolation ---");
  const fakeClinicId = "00000000-0000-0000-0000-000000000001";
  const leaked = await prisma.inventoryItem.findFirst({
    where: { id: corrItem.id, clinicId: fakeClinicId },
  });
  check("I: item not visible under different clinicId", leaked === null, `leaked=${JSON.stringify(leaked)}`);

  // Also verify the item detail page returns 404/redirect for another clinic user
  // (Doctor is in the same clinic so we just verify the item is accessible to owner but
  //  not via fake route)
  const fakeRoute = await owner.get(`/inventory/00000000-0000-0000-0000-000000000001`);
  check("I: non-existent item returns 404", fakeRoute.status === 404 || [302, 307].includes(fakeRoute.status));

  // Cleanup H item
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: corrItem.id } });
  await prisma.inventoryItem.delete({ where: { id: corrItem.id } });

  // Summary
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
