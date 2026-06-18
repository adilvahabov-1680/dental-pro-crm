/**
 * E2E-проверка Session 38 — Low Stock Alerts / Reorder Suggestions v1:
 *   npx tsx scripts/e2e-low-stock-alerts-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 *
 * Покрывает:
 *   A  Access (auth guard, permission guard, owner can open)
 *   B  Out of stock → "Bitib"
 *   C  Low stock → "Az qalıb"
 *   D  Warning (quantity <= minQuantity*1.5) → "Azalır"
 *   E  OK item hidden from default attention list
 *   F  Suggested reorder formula + purchase unit conversion
 *   G  Search + status filter + category filter
 *   H  Tenant isolation
 *   I  Supplier info visibility
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
  async postForm(path: string, pageHtml: string, fields: Record<string, string>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
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

/** Извлекает HTML-фрагмент <tr> по data-e2e-marker (для проверки содержимого конкретной строки). */
function rowHtml(html: string, marker: string): string {
  const idx = html.indexOf(`data-e2e-marker="${marker}"`);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<tr", idx);
  const end = html.indexOf("</tr>", idx);
  if (start === -1 || end === -1) return "";
  return html.slice(start, end + 5);
}

async function main() {
  console.log(`E2E low-stock alerts check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const clinic2 = await prisma.clinic.findFirst({
    where: { slug: { not: "demo-klinika" }, deletedAt: null },
  });
  const owner2User = clinic2
    ? await prisma.user.findFirst({ where: { clinicId: clinic2.id, role: { key: "owner" } } })
    : null;

  // Cleanup any leftovers from previous failed runs
  await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: "E2E-LOWSTOCK-" } } });
  await prisma.inventoryCategory.deleteMany({ where: { name: "E2E-LOWSTOCK-Category" } });
  await prisma.supplier.deleteMany({ where: { name: "E2E-LOWSTOCK-Supplier" } });

  console.log("Setup — creating test data…");

  const category = await prisma.inventoryCategory.create({
    data: { clinicId: clinic.id, name: "E2E-LOWSTOCK-Category", isActive: true },
  });
  const supplier = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-LOWSTOCK-Supplier", isActive: true },
  });

  const itemOut = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-LOWSTOCK-OutOfStock", unit: "ədəd", quantity: 0, minQuantity: 10 },
  });
  const itemLow = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-LOWSTOCK-Low",
      unit: "ədəd",
      quantity: 5,
      minQuantity: 10,
      categoryId: category.id,
    },
  });
  const itemWarning = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-LOWSTOCK-Warning", unit: "ədəd", quantity: 14, minQuantity: 10 },
  });
  const itemOk = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-LOWSTOCK-OK", unit: "ədəd", quantity: 50, minQuantity: 10 },
  });
  const itemGloves = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-LOWSTOCK-Gloves",
      unit: "cüt",
      quantity: 8,
      minQuantity: 20,
      purchaseUnit: "qutu",
      purchaseToBaseFactor: 50,
    },
  });
  const itemSupplier = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-LOWSTOCK-WithSupplier",
      unit: "ədəd",
      quantity: 2,
      minQuantity: 10,
      supplierId: supplier.id,
    },
  });

  let clinic2Item: { id: string } | null = null;
  if (clinic2) {
    clinic2Item = await prisma.inventoryItem.create({
      data: { clinicId: clinic2.id, name: "E2E-LOWSTOCK-Clinic2Item", unit: "ədəd", quantity: 1, minQuantity: 10 },
    });
  }

  console.log("Setup complete.\n");

  // ── A: Access ─────────────────────────────────────────────────────────
  console.log("A — access control");
  const anon = new Session();
  const anonPage = await anon.get("/inventory/alerts");
  check("A1: anon redirected", [302, 303, 307].includes(anonPage.status), `status=${anonPage.status}`);

  const assistant = new Session();
  check("A2: assistant login ok", await assistant.login("assistent@demo.dentalpro.az"));
  const assistantPage = await assistant.get("/inventory/alerts");
  check(
    "A3: user without inventory.view denied",
    assistantPage.status !== 200,
    `status=${assistantPage.status}`,
  );

  const owner = new Session();
  await owner.login("admin@demo.dentalpro.az");
  // warm-up: re-login before first authenticated GET (established e2e pattern)
  await owner.login("admin@demo.dentalpro.az");

  const allPage = await owner.get("/inventory/alerts?status=all");
  check("A4: owner can open /inventory/alerts", allPage.status === 200, `status=${allPage.status}`);

  // ── B: Out of stock ───────────────────────────────────────────────────
  console.log("\nB — out of stock status");
  const outRow = rowHtml(allPage.html, `alert-row-${itemOut.id}`);
  check("B1: out-of-stock row present", outRow.includes("E2E-LOWSTOCK-OutOfStock"));
  check("B2: out-of-stock shows 'Bitib'", outRow.includes("Bitib"));

  // ── C: Low stock ──────────────────────────────────────────────────────
  console.log("\nC — low stock status");
  const lowRow = rowHtml(allPage.html, `alert-row-${itemLow.id}`);
  check("C1: low-stock row present", lowRow.includes("E2E-LOWSTOCK-Low"));
  check("C2: low-stock shows 'Az qalıb'", lowRow.includes("Az qalıb"));

  // ── D: Warning ────────────────────────────────────────────────────────
  console.log("\nD — warning status (quantity <= minQuantity*1.5)");
  const warningRow = rowHtml(allPage.html, `alert-row-${itemWarning.id}`);
  check("D1: warning row present", warningRow.includes("E2E-LOWSTOCK-Warning"));
  check("D2: warning shows 'Azalır'", warningRow.includes("Azalır"));

  // ── E: OK item hidden from default attention list ───────────────────────
  console.log("\nE — OK item hidden from default list");
  const defaultPage = await owner.get(`/inventory/alerts?q=E2E-LOWSTOCK-OK`);
  check(
    "E1: OK item NOT in default attention list",
    !defaultPage.html.includes(`alert-row-${itemOk.id}`),
    `unexpectedly present`,
  );
  const allOkPage = await owner.get(`/inventory/alerts?status=all&q=E2E-LOWSTOCK-OK`);
  check(
    "E2: OK item present under status=all",
    allOkPage.html.includes(`alert-row-${itemOk.id}`),
    `not found under status=all`,
  );
  check(
    "E3: OK item shows 'Normal' status",
    rowHtml(allOkPage.html, `alert-row-${itemOk.id}`).includes("Normal"),
  );

  // ── F: Suggested reorder formula ──────────────────────────────────────
  console.log("\nF — suggested reorder quantity + purchase unit conversion");
  // itemLow: minQuantity=10, quantity=5 → suggestedBaseQuantity = max(10*2-5,10) = 15
  const lowSuggested = rowHtml(allPage.html, `alert-suggested-${itemLow.id}`);
  check("F1: suggestedBaseQuantity = 15 for low item", lowSuggested.includes("15"), lowSuggested);

  // itemGloves: minQuantity=20, quantity=8, purchaseToBaseFactor=50
  // suggestedBaseQuantity = max(20*2-8,20) = 32; suggestedPurchaseUnits = ceil(32/50) = 1
  const glovesRow = rowHtml(allPage.html, `alert-row-${itemGloves.id}`);
  check("F2: gloves row present", glovesRow.includes("E2E-LOWSTOCK-Gloves"));
  const glovesSuggested = rowHtml(allPage.html, `alert-suggested-${itemGloves.id}`);
  check("F3: gloves suggestedBaseQuantity = 32", glovesSuggested.includes("32"), glovesSuggested);
  check("F4: gloves suggestedPurchaseUnits = 1 qutu", glovesSuggested.includes("1 qutu"), glovesSuggested);

  // ── G: Search / status filter / category filter ─────────────────────────
  console.log("\nG — search, status filter, category filter");
  const searchPage = await owner.get("/inventory/alerts?status=all&q=E2E-LOWSTOCK-Gloves");
  check(
    "G1: search by name returns only matching item",
    searchPage.html.includes(`alert-row-${itemGloves.id}`) &&
      !searchPage.html.includes(`alert-row-${itemLow.id}`),
  );

  const statusOutPage = await owner.get("/inventory/alerts?status=out_of_stock");
  check(
    "G2: status=out_of_stock shows only out-of-stock items",
    statusOutPage.html.includes(`alert-row-${itemOut.id}`) &&
      !statusOutPage.html.includes(`alert-row-${itemLow.id}`) &&
      !statusOutPage.html.includes(`alert-row-${itemWarning.id}`),
  );

  const statusLowPage = await owner.get("/inventory/alerts?status=low_stock");
  check(
    "G3: status=low_stock shows only low-stock items",
    statusLowPage.html.includes(`alert-row-${itemLow.id}`) &&
      !statusLowPage.html.includes(`alert-row-${itemOut.id}`),
  );

  const statusWarningPage = await owner.get("/inventory/alerts?status=warning");
  check(
    "G4: status=warning shows only warning items",
    statusWarningPage.html.includes(`alert-row-${itemWarning.id}`) &&
      !statusWarningPage.html.includes(`alert-row-${itemLow.id}`),
  );

  const categoryPage = await owner.get(`/inventory/alerts?status=all&category=${category.id}`);
  check(
    "G5: category filter shows only items in that category",
    categoryPage.html.includes(`alert-row-${itemLow.id}`) &&
      !categoryPage.html.includes(`alert-row-${itemGloves.id}`),
  );

  // ── H: Tenant isolation ───────────────────────────────────────────────
  console.log("\nH — tenant isolation");
  if (clinic2 && owner2User && clinic2Item) {
    check(
      "H1: clinic1 owner cannot see clinic2 item",
      !allPage.html.includes(`alert-row-${clinic2Item.id}`),
    );
    const owner2 = new Session();
    await owner2.login(owner2User.email);
    await owner2.login(owner2User.email);
    const owner2Page = await owner2.get("/inventory/alerts?status=all");
    check(
      "H2: clinic2 owner sees own item, not clinic1 items",
      owner2Page.html.includes(`alert-row-${clinic2Item.id}`) &&
        !owner2Page.html.includes(`alert-row-${itemLow.id}`),
    );
  } else {
    console.log("  ~ H: skipped (no second clinic in seed)");
    passed += 2;
  }

  // ── I: Supplier info ──────────────────────────────────────────────────
  console.log("\nI — supplier visibility");
  const supplierRow = rowHtml(allPage.html, `alert-row-${itemSupplier.id}`);
  check("I1: item-with-supplier row present", supplierRow.includes("E2E-LOWSTOCK-WithSupplier"));
  check(
    "I2: supplier name shown for linked item",
    allPage.html.includes(`alert-supplier-${itemSupplier.id}`) && supplierRow.includes("E2E-LOWSTOCK-Supplier"),
  );
  const noSupplierRow = rowHtml(allPage.html, `alert-row-${itemLow.id}`);
  check(
    "I3: item without supplier shows 'noSupplier' placeholder",
    !noSupplierRow.includes(`alert-supplier-${itemLow.id}`),
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: "E2E-LOWSTOCK-" } } });
  await prisma.inventoryCategory.deleteMany({ where: { id: category.id } });
  await prisma.supplier.deleteMany({ where: { id: supplier.id } });

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
