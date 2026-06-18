/**
 * E2E-проверка Session 39 — Supplier Reorder Draft from Low Stock v1:
 *   npx tsx scripts/e2e-low-stock-reorder-drafts-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 *
 * Покрывает:
 *   A  Access (controls visible for canManage, hidden otherwise; anon redirect; no-permission denied)
 *   B  Eligible item (has supplier) selectable
 *   C  Item without supplier shows marker, not selectable
 *   D  Suggested quantity default + override respected
 *   E  Single supplier — two items → one order, two items
 *   F  Multiple suppliers — grouped into separate orders
 *   G  No stock mutation / no InventoryMovement
 *   H  Order visibility (list + detail page)
 *   I  Tenant isolation
 *   J  Super admin safety
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

/** Extracts a single self-closing/void tag (e.g. <input ... />) by its data-e2e-marker. */
function tagHtml(html: string, marker: string): string {
  const idx = html.indexOf(`data-e2e-marker="${marker}"`);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<input", idx);
  const end = html.indexOf(">", idx);
  if (start === -1 || end === -1) return "";
  return html.slice(start, end + 1);
}

function rowHtml(html: string, marker: string): string {
  const idx = html.indexOf(`data-e2e-marker="${marker}"`);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<tr", idx);
  const end = html.indexOf("</tr>", idx);
  if (start === -1 || end === -1) return "";
  return html.slice(start, end + 5);
}

/** Builds the reorder-draft POST fields for a list of (inventoryItemId, quantity) selections. */
function buildReorderFields(
  selections: Array<{ id: string; qty: number }>,
  note?: string,
): Record<string, string> {
  const fields: Record<string, string> = {};
  selections.forEach((s, idx) => {
    fields[`items[${idx}].inventoryItemId`] = s.id;
    fields[`items[${idx}].selected`] = "on";
    fields[`items[${idx}].quantity`] = String(s.qty);
  });
  if (note !== undefined) fields.note = note;
  return fields;
}

async function main() {
  console.log(`E2E low-stock reorder drafts check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const clinic2 = await prisma.clinic.findFirst({
    where: { slug: { not: "demo-klinika" }, deletedAt: null },
  });
  const owner2User = clinic2
    ? await prisma.user.findFirst({ where: { clinicId: clinic2.id, role: { key: "owner" } } })
    : null;
  const superAdminUser = await prisma.user.findFirst({
    where: { clinicId: null, role: { key: "super_admin" } },
  });

  // Cleanup leftovers from previous failed runs
  await prisma.supplierOrderItem.deleteMany({
    where: { inventoryItem: { name: { startsWith: "E2E-REORDER-" } } },
  });
  await prisma.supplierOrder.deleteMany({ where: { number: { startsWith: "SO-" }, notes: "E2E-REORDER-TEST" } });
  await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: "E2E-REORDER-" } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: "E2E-REORDER-" } } });

  console.log("Setup — creating test data…");

  const supplierD = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-REORDER-SupplierD", isActive: true },
  });
  const itemD1 = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-REORDER-D1",
      unit: "ədəd",
      quantity: 4,
      minQuantity: 10,
      supplierId: supplierD.id,
      unitCost: 500,
    },
  });
  // suggestedBaseQuantity = max(10*2-4,10) = 16

  const itemNoSupplier = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-REORDER-NoSupplier", unit: "ədəd", quantity: 2, minQuantity: 10 },
  });

  const supplierE = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-REORDER-SupplierE", isActive: true },
  });
  const itemE1 = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-REORDER-E1",
      unit: "ədəd",
      quantity: 1,
      minQuantity: 5,
      supplierId: supplierE.id,
      unitCost: 200,
    },
  }); // suggested = max(10-1,5) = 9
  const itemE2 = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-REORDER-E2",
      unit: "ədəd",
      quantity: 2,
      minQuantity: 6,
      supplierId: supplierE.id,
      unitCost: 300,
    },
  }); // suggested = max(12-2,6) = 10

  const supplierF1 = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-REORDER-SupplierF1", isActive: true },
  });
  const supplierF2 = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-REORDER-SupplierF2", isActive: true },
  });
  const itemF1 = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-REORDER-F1",
      unit: "ədəd",
      quantity: 1,
      minQuantity: 4,
      supplierId: supplierF1.id,
      unitCost: 100,
    },
  }); // suggested = max(8-1,4) = 7
  const itemF2 = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-REORDER-F2",
      unit: "ədəd",
      quantity: 1,
      minQuantity: 3,
      supplierId: supplierF2.id,
      unitCost: 150,
    },
  }); // suggested = max(6-1,3) = 5

  let itemClinic2: { id: string } | null = null;
  if (clinic2) {
    const supplierClinic2 = await prisma.supplier.create({
      data: { clinicId: clinic2.id, name: "E2E-REORDER-Clinic2Supplier", isActive: true },
    });
    itemClinic2 = await prisma.inventoryItem.create({
      data: {
        clinicId: clinic2.id,
        name: "E2E-REORDER-Clinic2Item",
        unit: "ədəd",
        quantity: 1,
        minQuantity: 10,
        supplierId: supplierClinic2.id,
      },
    });
  }

  console.log("Setup complete.\n");

  // ── A: Access ─────────────────────────────────────────────────────────
  console.log("A — access control");
  const anon = new Session();
  const anonPage = await anon.get("/inventory/alerts");
  check("A1: anon redirected", [302, 303, 307].includes(anonPage.status), `status=${anonPage.status}`);

  const owner = new Session();
  await owner.login("admin@demo.dentalpro.az");
  await owner.login("admin@demo.dentalpro.az"); // warm-up

  const ownerPage = await owner.get("/inventory/alerts?status=all");
  check("A2: owner (canManage) sees reorder draft controls", ownerPage.html.includes("reorder-draft-controls"));
  check(
    "A3: owner sees create button",
    ownerPage.html.includes("reorder-create-button"),
  );

  const doctor = new Session();
  await doctor.login("hekim@demo.dentalpro.az");
  const doctorPage = await doctor.get("/inventory/alerts?status=all");
  check(
    "A4: doctor (view-only) does NOT see reorder draft controls",
    !doctorPage.html.includes("reorder-draft-controls"),
  );

  // doctor attempts to POST the action directly (no inventory.manage) — must not create anything
  const beforeCountA = await prisma.supplierOrderItem.count({
    where: { inventoryItemId: itemD1.id },
  });
  await doctor.postForm("/inventory/alerts", doctorPage.html, buildReorderFields([{ id: itemD1.id, qty: 16 }]));
  const afterCountA = await prisma.supplierOrderItem.count({ where: { inventoryItemId: itemD1.id } });
  check("A5: doctor cannot create draft (no order item created)", afterCountA === beforeCountA);

  // ── B: Eligible item ──────────────────────────────────────────────────
  console.log("\nB — eligible item (has supplier) selectable");
  const eligibleRow = rowHtml(ownerPage.html, `alert-row-${itemD1.id}`);
  check("B1: eligible item row present", eligibleRow.includes("E2E-REORDER-D1"));
  check(
    "B2: eligible item checkbox not marked unavailable",
    !eligibleRow.includes(`reorder-no-supplier-${itemD1.id}`),
  );

  // ── C: Item without supplier ────────────────────────────────────────────
  console.log("\nC — item without supplier shows marker, not selectable");
  const noSupRow = rowHtml(ownerPage.html, `alert-row-${itemNoSupplier.id}`);
  check("C1: no-supplier item row present", noSupRow.includes("E2E-REORDER-NoSupplier"));
  check(
    "C2: no-supplier marker shown",
    noSupRow.includes(`reorder-no-supplier-${itemNoSupplier.id}`) && noSupRow.includes("Təchizatçı seçilməyib"),
  );
  const noSupCheckbox = tagHtml(ownerPage.html, `reorder-select-${itemNoSupplier.id}`);
  check("C3: no-supplier checkbox disabled", noSupCheckbox.includes("disabled"), noSupCheckbox);

  // ── D: Suggested quantity + override ─────────────────────────────────
  console.log("\nD — suggested quantity default + override");
  const suggestedCell = rowHtml(ownerPage.html, `alert-suggested-${itemD1.id}`);
  check("D1: suggestedBaseQuantity = 16 shown", suggestedCell.includes("16"), suggestedCell);

  const overrideQty = 25; // deliberately different from suggested (16)
  const resD = await owner.postForm(
    "/inventory/alerts",
    ownerPage.html,
    buildReorderFields([{ id: itemD1.id, qty: overrideQty }], "E2E-REORDER-TEST"),
  );
  check("D2: create draft request responds ok", resD.status === 200, `status=${resD.status}`);

  const orderItemD1 = await prisma.supplierOrderItem.findFirst({
    where: { inventoryItemId: itemD1.id },
    include: { order: { select: { supplierId: true, status: true, number: true } } },
  });
  check("D3: order item created for itemD1", !!orderItemD1);
  check(
    "D4: override quantity (25) respected, not suggested (16)",
    Number(orderItemD1?.quantity) === overrideQty,
    `got ${orderItemD1?.quantity}`,
  );
  check("D5: created order status is draft", orderItemD1?.order.status === "draft");
  const orderD1Id = orderItemD1?.supplierOrderId ?? "";

  // ── E: Single supplier — two items → one order ───────────────────────
  console.log("\nE — single supplier, two items → one order");
  const ownerPage2 = await owner.get("/inventory/alerts?status=all");
  const resE = await owner.postForm(
    "/inventory/alerts",
    ownerPage2.html,
    buildReorderFields([
      { id: itemE1.id, qty: 9 },
      { id: itemE2.id, qty: 10 },
    ]),
  );
  check("E1: create draft request responds ok", resE.status === 200, `status=${resE.status}`);

  const ordersForSupplierE = await prisma.supplierOrder.findMany({
    where: { supplierId: supplierE.id, deletedAt: null },
  });
  check("E2: exactly one order created for supplierE", ordersForSupplierE.length === 1, `count=${ordersForSupplierE.length}`);

  const itemsInSupplierEOrder = ordersForSupplierE[0]
    ? await prisma.supplierOrderItem.findMany({ where: { supplierOrderId: ordersForSupplierE[0].id } })
    : [];
  check("E3: order has exactly two items", itemsInSupplierEOrder.length === 2, `count=${itemsInSupplierEOrder.length}`);

  // ── F: Multiple suppliers → grouped into separate orders ──────────────
  console.log("\nF — multiple suppliers → separate orders");
  const ownerPage3 = await owner.get("/inventory/alerts?status=all");
  const resF = await owner.postForm(
    "/inventory/alerts",
    ownerPage3.html,
    buildReorderFields([
      { id: itemF1.id, qty: 7 },
      { id: itemF2.id, qty: 5 },
    ]),
  );
  check("F1: create draft request responds ok", resF.status === 200, `status=${resF.status}`);

  const ordersF1 = await prisma.supplierOrder.findMany({ where: { supplierId: supplierF1.id, deletedAt: null } });
  const ordersF2 = await prisma.supplierOrder.findMany({ where: { supplierId: supplierF2.id, deletedAt: null } });
  check("F2: one order created for supplierF1", ordersF1.length === 1, `count=${ordersF1.length}`);
  check("F3: one order created for supplierF2", ordersF2.length === 1, `count=${ordersF2.length}`);
  check("F4: orders are distinct", ordersF1[0]?.id !== ordersF2[0]?.id);

  // ── G: No stock mutation / no InventoryMovement ────────────────────────
  console.log("\nG — no stock mutation, no InventoryMovement");
  const itemD1AfterAll = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemD1.id } });
  check("G1: itemD1 quantity unchanged (still 4)", Number(itemD1AfterAll.quantity) === 4, `qty=${itemD1AfterAll.quantity}`);
  const movementsForD1 = await prisma.inventoryMovement.count({ where: { inventoryItemId: itemD1.id } });
  check("G2: no InventoryMovement created for itemD1", movementsForD1 === 0, `count=${movementsForD1}`);
  const itemF1After = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemF1.id } });
  check("G3: itemF1 quantity unchanged (still 1)", Number(itemF1After.quantity) === 1, `qty=${itemF1After.quantity}`);

  // ── H: Order visibility ──────────────────────────────────────────────
  console.log("\nH — order visibility (list + detail)");
  const ordersListPage = await owner.get("/inventory/supplier-orders");
  check("H1: orders list page loads", ordersListPage.status === 200, `status=${ordersListPage.status}`);
  check(
    "H2: supplierE order appears in list",
    ordersForSupplierE[0] ? ordersListPage.html.includes(ordersForSupplierE[0].number) : false,
  );

  if (ordersForSupplierE[0]) {
    const orderDetailPage = await owner.get(`/inventory/supplier-orders/${ordersForSupplierE[0].id}`);
    check("H3: order detail page opens", orderDetailPage.status === 200, `status=${orderDetailPage.status}`);
    check("H4: order detail shows item name", orderDetailPage.html.includes("E2E-REORDER-E1"));
  } else {
    check("H3: order detail page opens", false, "no order to check");
    check("H4: order detail shows item name", false, "no order to check");
  }

  // ── I: Tenant isolation ───────────────────────────────────────────────
  console.log("\nI — tenant isolation");
  if (clinic2 && itemClinic2) {
    const beforeCountI = await prisma.supplierOrderItem.count({ where: { inventoryItemId: itemClinic2.id } });
    const ownerPage4 = await owner.get("/inventory/alerts?status=all");
    await owner.postForm(
      "/inventory/alerts",
      ownerPage4.html,
      buildReorderFields([{ id: itemClinic2.id, qty: 5 }]),
    );
    const afterCountI = await prisma.supplierOrderItem.count({ where: { inventoryItemId: itemClinic2.id } });
    check(
      "I1: clinic1 owner cannot create order item for clinic2's inventory item",
      afterCountI === beforeCountI,
      `before=${beforeCountI} after=${afterCountI}`,
    );
  } else {
    console.log("  ~ I: skipped (no second clinic in seed)");
    passed++;
  }

  // ── J: Super admin safety ────────────────────────────────────────────
  console.log("\nJ — super admin safety");
  if (superAdminUser) {
    const saSession = new Session();
    await saSession.login(superAdminUser.email);
    const beforeCountJ = await prisma.supplierOrderItem.count({ where: { inventoryItemId: itemD1.id } });
    const saPage = await saSession.get("/inventory/alerts");
    await saSession.postForm("/inventory/alerts", saPage.html, buildReorderFields([{ id: itemD1.id, qty: 5 }]));
    const afterCountJ = await prisma.supplierOrderItem.count({ where: { inventoryItemId: itemD1.id } });
    check("J1: super admin cannot create draft", afterCountJ === beforeCountJ);
  } else {
    console.log("  ~ J: skipped (no super_admin user)");
    passed++;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  const cleanupOrderIds = [
    orderD1Id,
    ...ordersForSupplierE.map((o) => o.id),
    ...ordersF1.map((o) => o.id),
    ...ordersF2.map((o) => o.id),
  ].filter(Boolean);
  await prisma.supplierOrderItem.deleteMany({ where: { supplierOrderId: { in: cleanupOrderIds } } });
  await prisma.supplierOrder.deleteMany({ where: { id: { in: cleanupOrderIds } } });
  await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: "E2E-REORDER-" } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: "E2E-REORDER-" } } });

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
