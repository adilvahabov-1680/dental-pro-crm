/**
 * E2E-проверка модуля Inventory Stock Corrections (сессия 31):
 *   npx tsx scripts/e2e-inventory-corrections-check.ts
 * Требует dev-сервер + seed.
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
    const fd = new FormData();

    // If a marker is specified, extract just that form's hidden inputs
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
  console.log(`E2E inventory-corrections check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // Clean up any e2e test items from previous runs
  await prisma.inventoryMovement.deleteMany({
    where: { clinicId: clinic.id, reason: { startsWith: "E2E-CORR:" } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E-CORR-" } },
  });

  // Create a dedicated test item for corrections
  const testItem = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-CORR-TestItem",
      unit: "ədəd",
      quantity: 100,
      minQuantity: 5,
      unitCost: 500,
      isActive: true,
    },
  });
  // Record initial movement so audit trail is consistent
  await prisma.inventoryMovement.create({
    data: {
      clinicId: clinic.id,
      inventoryItemId: testItem.id,
      type: "in_stock",
      quantity: 100,
      reason: "E2E-CORR: initial stock",
      performedById: (await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id } })).id,
    },
  });

  // ── 1. Seed / DB setup ──────────────────────────────────────────────────
  console.log("--- 1. Setup checks ---");
  const freshItem = await prisma.inventoryItem.findUnique({ where: { id: testItem.id } });
  check("setup: test item created with qty=100", Number(freshItem?.quantity) === 100);

  // ── 2. Auth guard ────────────────────────────────────────────────────────
  console.log("\n--- 2. Auth guard ---");
  const anon = new Session();
  const anonPage = await anon.get(`/inventory/${testItem.id}`);
  check("anon: redirect to /login", [302, 307].includes(anonPage.status));

  // ── 3. Permission guard (doctor has inventory.view but NOT inventory.manage) ──
  console.log("\n--- 3. Permission guard ---");
  const doctor = new Session();
  check("doctor: login ok", await doctor.login("hekim@demo.dentalpro.az"));
  const doctorItemPage = await doctor.get(`/inventory/${testItem.id}`);
  check("doctor: item page accessible (view)", doctorItemPage.status === 200);
  check("doctor: correction form NOT shown", !doctorItemPage.html.includes('data-e2e-marker="stock-correction-form"'));

  // ── 4. Owner setup ───────────────────────────────────────────────────────
  console.log("\n--- 4. Owner access ---");
  const owner = new Session();
  check("owner: login ok", await owner.login("admin@demo.dentalpro.az"));
  const ownerItemPage = await owner.get(`/inventory/${testItem.id}`);
  check("owner: item page opens (200)", ownerItemPage.status === 200);
  check("owner: correction form shown", ownerItemPage.html.includes('data-e2e-marker="stock-correction-form"'));
  check("owner: current stock displayed", ownerItemPage.html.includes("100"));

  // ── 5. A. Positive adjustment (ADJUSTMENT_IN) ────────────────────────────
  console.log("\n--- 5. Adjustment IN ---");
  const p1 = await owner.get(`/inventory/${testItem.id}`);
  await owner.postForm(`/inventory/${testItem.id}`, p1.html, {
    itemId: testItem.id,
    type: "adjustment",
    quantity: "15",
    reason: "E2E-CORR: sayım artığı",
  }, "stock-correction-form");

  const afterIn = await prisma.inventoryItem.findUnique({ where: { id: testItem.id } });
  check("adj-in: quantity increased from 100 to 115", Number(afterIn?.quantity) === 115,
    `got ${afterIn?.quantity}`);
  const mvIn = await prisma.inventoryMovement.findFirst({
    where: { inventoryItemId: testItem.id, type: "adjustment", reason: "E2E-CORR: sayım artığı" },
  });
  check("adj-in: InventoryMovement created (type=adjustment)", !!mvIn);
  check("adj-in: movement quantity = 15", Number(mvIn?.quantity) === 15, `got ${mvIn?.quantity}`);
  check("adj-in: movement has clinicId", mvIn?.clinicId === clinic.id);
  check("adj-in: movement has performedById", !!mvIn?.performedById);

  // ── 6. B. Negative adjustment (ADJUSTMENT_OUT) ───────────────────────────
  console.log("\n--- 6. Adjustment OUT ---");
  const p2 = await owner.get(`/inventory/${testItem.id}`);
  await owner.postForm(`/inventory/${testItem.id}`, p2.html, {
    itemId: testItem.id,
    type: "adjustment_out",
    quantity: "10",
    reason: "E2E-CORR: sayım kəsiri",
    note: "Anbar yoxlaması zamanı aşkarlandı",
  }, "stock-correction-form");

  const afterOut = await prisma.inventoryItem.findUnique({ where: { id: testItem.id } });
  check("adj-out: quantity decreased from 115 to 105", Number(afterOut?.quantity) === 105,
    `got ${afterOut?.quantity}`);
  const mvOut = await prisma.inventoryMovement.findFirst({
    where: { inventoryItemId: testItem.id, type: "adjustment_out", reason: "E2E-CORR: sayım kəsiri" },
  });
  check("adj-out: InventoryMovement created (type=adjustment_out)", !!mvOut);
  check("adj-out: movement note stored", mvOut?.note === "Anbar yoxlaması zamanı aşkarlandı",
    `got "${mvOut?.note}"`);

  // ── 7. C. Write-off ──────────────────────────────────────────────────────
  console.log("\n--- 7. Write-off ---");
  const p3 = await owner.get(`/inventory/${testItem.id}`);
  await owner.postForm(`/inventory/${testItem.id}`, p3.html, {
    itemId: testItem.id,
    type: "write_off",
    quantity: "5",
    reason: "E2E-CORR: xarab material",
    note: "Rütubət səbəbindən xarab oldu",
  }, "stock-correction-form");

  const afterWO = await prisma.inventoryItem.findUnique({ where: { id: testItem.id } });
  check("write-off: quantity decreased from 105 to 100", Number(afterWO?.quantity) === 100,
    `got ${afterWO?.quantity}`);
  const mvWO = await prisma.inventoryMovement.findFirst({
    where: { inventoryItemId: testItem.id, type: "write_off", reason: "E2E-CORR: xarab material" },
  });
  check("write-off: InventoryMovement type=write_off", !!mvWO);
  check("write-off: note stored", !!mvWO?.note);

  // ── 8. D. Required reason validation ─────────────────────────────────────
  console.log("\n--- 8. Required reason ---");
  const qtyBeforeShort = Number(
    (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
  );
  const p4 = await owner.get(`/inventory/${testItem.id}`);
  await owner.postForm(`/inventory/${testItem.id}`, p4.html, {
    itemId: testItem.id,
    type: "adjustment_out",
    quantity: "5",
    reason: "ab", // too short (< 3 chars)
  }, "stock-correction-form");
  const qtyAfterShort = Number(
    (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
  );
  check("required-reason: short reason rejected, qty unchanged",
    qtyAfterShort === qtyBeforeShort,
    `before=${qtyBeforeShort} after=${qtyAfterShort}`);

  // ── 9. E. Negative stock protection ──────────────────────────────────────
  console.log("\n--- 9. Negative stock protection ---");
  const currentQty = Number(
    (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
  );
  const p5 = await owner.get(`/inventory/${testItem.id}`);
  await owner.postForm(`/inventory/${testItem.id}`, p5.html, {
    itemId: testItem.id,
    type: "adjustment_out",
    quantity: String(currentQty + 999), // way more than stock
    reason: "E2E-CORR: oversized deduction attempt",
  }, "stock-correction-form");
  const qtyAfterOverdraw = Number(
    (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
  );
  check("neg-stock: overdraw rejected, qty unchanged",
    qtyAfterOverdraw === currentQty,
    `before=${currentQty} after=${qtyAfterOverdraw}`);

  // ── 10. F. Tenant isolation ───────────────────────────────────────────────
  console.log("\n--- 10. Tenant isolation ---");
  // Create a second clinic and item
  let otherClinic = await prisma.clinic.findFirst({ where: { slug: { not: "demo-klinika" }, deletedAt: null } });
  if (otherClinic) {
    const otherItem = await prisma.inventoryItem.create({
      data: {
        clinicId: otherClinic.id,
        name: "E2E-CORR-OtherClinic",
        unit: "ədəd",
        quantity: 50,
        minQuantity: 1,
        isActive: true,
      },
    });
    const otherQtyBefore = 50;
    const p6 = await owner.get(`/inventory/${testItem.id}`);
    await owner.postForm(`/inventory/${testItem.id}`, p6.html, {
      itemId: otherItem.id, // cross-tenant item ID
      type: "adjustment_out",
      quantity: "5",
      reason: "E2E-CORR: cross-tenant attempt",
    }, "stock-correction-form");
    const otherItemAfter = await prisma.inventoryItem.findUnique({ where: { id: otherItem.id } });
    check("tenant: cross-clinic item NOT affected",
      Number(otherItemAfter?.quantity) === otherQtyBefore,
      `got ${otherItemAfter?.quantity}`);
    // Cleanup
    await prisma.inventoryItem.delete({ where: { id: otherItem.id } }).catch(() => {});
  } else {
    check("tenant: no second clinic in DB — skip isolation test (logged)", true);
  }

  // ── 11. G. Permission — assistant cannot correct ──────────────────────────
  console.log("\n--- 11. Permission check ---");
  const assistant = new Session();
  const assUser = await prisma.user.findFirst({
    where: { clinicId: clinic.id, role: { key: { in: ["assistant", "reception"] } } },
  });
  if (assUser) {
    check("assistant: login ok", await assistant.login(assUser.email));
    const assPage = await assistant.get(`/inventory/${testItem.id}`);
    // assistant doesn't have inventory.view — should redirect
    check("assistant: no inventory access (redirect)", [302, 307].includes(assPage.status));
  } else {
    check("permission: no assistant user in seed — skip (ok)", true);
  }

  // ── 12. H. Super admin safety ─────────────────────────────────────────────
  console.log("\n--- 12. Super admin safety ---");
  const superAdmin = await prisma.user.findFirst({ where: { clinicId: null, role: { key: "super_admin" } } });
  if (superAdmin) {
    const superSess = new Session();
    check("super: login ok", await superSess.login(superAdmin.email));
    const qtySuperBefore = Number(
      (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
    );
    const sp = await superSess.get(`/inventory/${testItem.id}`);
    // super_admin has clinicId=null → should be blocked by action, page may redirect
    const superResult = await superSess.postForm(`/inventory/${testItem.id}`, sp.html, {
      itemId: testItem.id,
      type: "adjustment",
      quantity: "999",
      reason: "E2E-CORR: super admin mutation attempt",
    }, "stock-correction-form");
    const qtySuperAfter = Number(
      (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
    );
    check("super: clinicId=null cannot mutate clinic inventory",
      qtySuperAfter === qtySuperBefore,
      `before=${qtySuperBefore} after=${qtySuperAfter}`);
  } else {
    check("super: no super_admin in DB — skip (ok)", true);
  }

  // ── 13. I. Audit integrity ────────────────────────────────────────────────
  console.log("\n--- 13. Audit integrity ---");
  const correctionMovements = await prisma.inventoryMovement.findMany({
    where: {
      inventoryItemId: testItem.id,
      type: { in: ["adjustment", "adjustment_out", "write_off"] },
    },
  });
  check("audit: all correction movements have clinicId",
    correctionMovements.every((m) => !!m.clinicId));
  check("audit: all correction movements have performedById",
    correctionMovements.every((m) => !!m.performedById));
  check("audit: all correction movements have createdAt",
    correctionMovements.every((m) => !!m.createdAt));

  // Verify that quantity == sum of signed movements
  const allMovements = await prisma.inventoryMovement.findMany({
    where: { inventoryItemId: testItem.id },
  });
  const positiveTypes = new Set(["in_stock", "adjustment"]);
  const sumFromMovements = allMovements.reduce((acc, m) => {
    const sign = positiveTypes.has(m.type) ? 1 : -1;
    return Math.round((acc + sign * Number(m.quantity)) * 1000) / 1000;
  }, 0);
  const finalQty = Number(
    (await prisma.inventoryItem.findUnique({ where: { id: testItem.id } }))?.quantity,
  );
  check("audit: item.quantity matches sum of all movements",
    Math.abs(sumFromMovements - finalQty) < 0.001,
    `sum=${sumFromMovements} item.qty=${finalQty}`);

  // ── 14. History UI ────────────────────────────────────────────────────────
  console.log("\n--- 14. Movement history UI ---");
  const histPage = await owner.get(`/inventory/${testItem.id}`);
  check("history: adjustment type label shown",
    histPage.html.includes("Düzəliş (artırma)") || histPage.html.includes("adjustment"));
  check("history: write_off label shown",
    histPage.html.includes("Silinmə") || histPage.html.includes("write_off"));
  check("history: note displayed for write_off movement",
    histPage.html.includes("Rütubət"));

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: testItem.id } });
  await prisma.inventoryItem.delete({ where: { id: testItem.id } }).catch(() => {});
  console.log("  (test data removed)");

  // ── Summary ───────────────────────────────────────────────────────────────
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
