/**
 * E2E-проверка Session 40 — Supplier Order Draft Approval Flow v1:
 *   npx tsx scripts/e2e-supplier-order-draft-approval-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 *
 * Покрывает:
 *   A  Draft visibility (badge + explanatory note + confirm button)
 *   B  Confirm action (draft -> approved)
 *   C  Empty draft protection (cannot confirm with 0 items)
 *   D  Non-draft protection (confirming already-approved order rejected, no mutation)
 *   E  Receiving blocked for draft order (server-side, no movement, no stock change)
 *   F  No automatic sending (confirm does not set status=sent / sentAt)
 *   G  Low-stock draft compatibility (create via /inventory/alerts, then confirm)
 *   H  Tenant isolation
 *   I  Permission (no inventory.manage cannot confirm)
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
  async postForm(path: string, pageHtml: string, fields: Record<string, string>, markerFilter?: string) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();

    let html = pageHtml;
    if (markerFilter) {
      const idx = pageHtml.indexOf(`data-e2e-marker="${markerFilter}"`);
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
  console.log(`E2E supplier order draft approval check → ${BASE}\n`);

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

  // Matches both explicitly-numbered test orders AND orders auto-numbered "SO-XXXX"
  // by the low-stock reorder flow (those are identified by supplier name instead).
  const cleanupAll = async () => {
    const orderFilter = {
      OR: [
        { number: { startsWith: "E2E-APPROVAL-" } },
        { supplier: { name: { startsWith: "E2E-APPROVAL-" } } },
      ],
    };
    await prisma.supplierOrderItem.deleteMany({
      where: { OR: [{ nameSnapshot: { startsWith: "E2E-APPROVAL-" } }, { order: orderFilter }] },
    });
    await prisma.supplierOrder.deleteMany({ where: orderFilter });
    await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: "E2E-APPROVAL-" } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: "E2E-APPROVAL-" } } });
  };

  // Cleanup leftovers from previous failed runs
  await cleanupAll();

  console.log("Setup — creating test data…");

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));
  await owner.login("admin@demo.dentalpro.az"); // warm-up

  const supplier = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-APPROVAL-Supplier", isActive: true },
  });
  const ownerUser = await prisma.user.findFirstOrThrow({
    where: { clinicId: clinic.id, role: { key: "owner" } },
  });

  let orderCounter = 0;
  const nextNumber = () => `E2E-APPROVAL-${++orderCounter}`;

  const createDraftOrder = async (withItem: boolean) => {
    const order = await prisma.supplierOrder.create({
      data: {
        clinicId: clinic.id,
        supplierId: supplier.id,
        number: nextNumber(),
        status: "draft",
        totalCost: withItem ? 1250 : 0,
        createdById: ownerUser.id,
      },
    });
    if (withItem) {
      await prisma.supplierOrderItem.create({
        data: {
          clinicId: clinic.id,
          supplierOrderId: order.id,
          quantity: "5",
          unitCost: 250,
          nameSnapshot: "E2E-APPROVAL-Item-Snapshot",
          unitSnapshot: "ədəd",
          priceSnapshot: "2.50",
          currencySnapshot: "AZN",
        },
      });
    }
    return order;
  };

  // ── A + B: visibility + confirm ─────────────────────────────────────────
  console.log("\nA — draft visibility");
  const orderAB = await createDraftOrder(true);
  const draftPage = await owner.get(`/inventory/supplier-orders/${orderAB.id}`);
  check("A1: draft order detail loads", draftPage.status === 200, `status=${draftPage.status}`);
  check("A2: draft badge shown (Qaralama)", draftPage.html.includes("Qaralama"));
  check(
    "A3: explanatory note shown",
    draftPage.html.includes("Bu sifariş hələ təsdiqlənməyib və avtomatik göndərilmir."),
  );
  check("A4: confirm button present", draftPage.html.includes("confirm-draft"));
  check("A5: mark-sent form still present (backward compat)", draftPage.html.includes("mark-sent"));
  check("A6: cancel-order form still present", draftPage.html.includes("cancel-order"));

  console.log("\nB — confirm action");
  const confirmResB = await owner.postForm(
    `/inventory/supplier-orders/${orderAB.id}`,
    draftPage.html,
    { orderId: orderAB.id },
    "confirm-draft",
  );
  check(
    "B1: confirm request responds ok",
    confirmResB.status === 200 || confirmResB.status === 303 || confirmResB.status === 307,
    `status=${confirmResB.status}`,
  );
  const orderAfterConfirm = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: orderAB.id } });
  check("B2: status changed to approved", orderAfterConfirm.status === "approved", `got ${orderAfterConfirm.status}`);
  check("B3: orderedAt timestamp set", !!orderAfterConfirm.orderedAt);

  const approvedPage = await owner.get(`/inventory/supplier-orders/${orderAB.id}`);
  check("B4: approved badge shown (Təsdiqlənib)", approvedPage.html.includes("Təsdiqlənib"));
  check("B5: confirm-draft form no longer shown", !approvedPage.html.includes("confirm-draft"));
  check("B6: mark-sent still available after approval", approvedPage.html.includes("mark-sent"));

  // ── F: no automatic sending ──────────────────────────────────────────────
  console.log("\nF — no automatic sending");
  check("F1: status is NOT sent", orderAfterConfirm.status !== "sent");
  check("F2: sentAt is still null", orderAfterConfirm.sentAt === null);

  // ── C: empty draft protection ────────────────────────────────────────────
  console.log("\nC — empty draft protection");
  const orderEmpty = await createDraftOrder(false);
  const emptyPage = await owner.get(`/inventory/supplier-orders/${orderEmpty.id}`);
  const confirmEmptyRes = await owner.postForm(
    `/inventory/supplier-orders/${orderEmpty.id}`,
    emptyPage.html,
    { orderId: orderEmpty.id },
    "confirm-draft",
  );
  check(
    "C1: confirm-empty request responds ok",
    confirmEmptyRes.status === 200 || confirmEmptyRes.status === 303 || confirmEmptyRes.status === 307,
  );
  const orderEmptyAfter = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: orderEmpty.id } });
  check("C2: empty draft order still draft (not confirmed)", orderEmptyAfter.status === "draft");

  // ── D: non-draft protection ───────────────────────────────────────────────
  console.log("\nD — non-draft protection");
  const orderApprovedDirect = await prisma.supplierOrder.create({
    data: {
      clinicId: clinic.id,
      supplierId: supplier.id,
      number: nextNumber(),
      status: "approved",
      orderedAt: new Date(),
      totalCost: 1000,
      createdById: ownerUser.id,
    },
  });
  // harvest a valid confirm-draft action token from a real draft page, then target the approved order
  const tokenSourceOrder = await createDraftOrder(true);
  const tokenSourcePage = await owner.get(`/inventory/supplier-orders/${tokenSourceOrder.id}`);
  await owner.postForm(
    `/inventory/supplier-orders/${tokenSourceOrder.id}`,
    tokenSourcePage.html,
    { orderId: orderApprovedDirect.id },
    "confirm-draft",
  );
  const orderApprovedAfter = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: orderApprovedDirect.id } });
  check(
    "D1: confirming an already-approved order does not change its status",
    orderApprovedAfter.status === "approved",
    `got ${orderApprovedAfter.status}`,
  );

  // ── E: receiving blocked for draft ──────────────────────────────────────
  console.log("\nE — receiving blocked for draft order");
  const testInvItem = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-APPROVAL-ReceiveItem", unit: "ədəd", quantity: 10, minQuantity: 0 },
  });
  const draftOrderForReceiving = await createDraftOrder(true);
  const draftOrderItem = await prisma.supplierOrderItem.findFirstOrThrow({
    where: { supplierOrderId: draftOrderForReceiving.id },
  });

  // a separate "received" order, purely to harvest a valid receive-form action token
  const receivedTokenOrder = await prisma.supplierOrder.create({
    data: {
      clinicId: clinic.id,
      supplierId: supplier.id,
      number: nextNumber(),
      status: "received",
      receivedAt: new Date(),
      totalCost: 500,
      createdById: ownerUser.id,
    },
  });
  const receivedTokenItem = await prisma.supplierOrderItem.create({
    data: {
      clinicId: clinic.id,
      supplierOrderId: receivedTokenOrder.id,
      quantity: "1",
      unitCost: 500,
      nameSnapshot: "E2E-APPROVAL-TokenItem",
      unitSnapshot: "ədəd",
      priceSnapshot: "5.00",
      currencySnapshot: "AZN",
    },
  });
  const receivedTokenPage = await owner.get(`/inventory/supplier-orders/${receivedTokenOrder.id}`);
  check(
    "E1: receive form present on a real received order (token source)",
    receivedTokenPage.html.includes(`receive-${receivedTokenItem.id}`),
  );

  const movementsBefore = await prisma.inventoryMovement.count({ where: { inventoryItemId: testInvItem.id } });
  const stockBefore = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: testInvItem.id } })).quantity;

  await owner.postForm(
    `/inventory/supplier-orders/${receivedTokenOrder.id}`,
    receivedTokenPage.html,
    { orderItemId: draftOrderItem.id, inventoryItemId: testInvItem.id, receivedQty: "3" },
    `receive-${receivedTokenItem.id}`,
  );

  const draftOrderItemAfter = await prisma.supplierOrderItem.findUniqueOrThrow({ where: { id: draftOrderItem.id } });
  check("E2: draft order item NOT marked received", draftOrderItemAfter.stockMovementId === null);
  const movementsAfter = await prisma.inventoryMovement.count({ where: { inventoryItemId: testInvItem.id } });
  check("E3: no InventoryMovement created", movementsAfter === movementsBefore, `before=${movementsBefore} after=${movementsAfter}`);
  const stockAfter = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: testInvItem.id } })).quantity;
  check("E4: stock quantity unchanged", String(stockAfter) === String(stockBefore), `before=${stockBefore} after=${stockAfter}`);

  // ── G: low-stock draft compatibility ─────────────────────────────────────
  console.log("\nG — low-stock draft compatibility");
  const lowStockSupplier = await prisma.supplier.create({
    data: { clinicId: clinic.id, name: "E2E-APPROVAL-LowStockSupplier", isActive: true },
  });
  const lowStockItem = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E-APPROVAL-LowStockItem",
      unit: "ədəd",
      quantity: 2,
      minQuantity: 10,
      supplierId: lowStockSupplier.id,
    },
  });
  const alertsPage = await owner.get("/inventory/alerts?status=all");
  await owner.postForm(
    "/inventory/alerts",
    alertsPage.html,
    {
      "items[0].inventoryItemId": lowStockItem.id,
      "items[0].selected": "on",
      "items[0].quantity": "20",
    },
    "reorder-draft-form",
  );

  const lowStockOrder = await prisma.supplierOrder.findFirst({
    where: { supplierId: lowStockSupplier.id, deletedAt: null },
  });
  check("G1: draft order created from low-stock alerts", !!lowStockOrder, "no order found");

  if (lowStockOrder) {
    const lowStockDetailPage = await owner.get(`/inventory/supplier-orders/${lowStockOrder.id}`);
    check("G2: low-stock draft shows confirm button", lowStockDetailPage.html.includes("confirm-draft"));

    await owner.postForm(
      `/inventory/supplier-orders/${lowStockOrder.id}`,
      lowStockDetailPage.html,
      { orderId: lowStockOrder.id },
      "confirm-draft",
    );
    const lowStockOrderAfter = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: lowStockOrder.id } });
    check("G3: low-stock draft confirmed (approved)", lowStockOrderAfter.status === "approved", `got ${lowStockOrderAfter.status}`);
  } else {
    check("G2: low-stock draft shows confirm button", false, "no order found");
    check("G3: low-stock draft confirmed (approved)", false, "no order found");
  }

  // ── H: tenant isolation ───────────────────────────────────────────────────
  console.log("\nH — tenant isolation");
  if (clinic2 && owner2User) {
    const clinic2Supplier = await prisma.supplier.create({
      data: { clinicId: clinic2.id, name: "E2E-APPROVAL-Clinic2Supplier", isActive: true },
    });
    const clinic2Order = await prisma.supplierOrder.create({
      data: {
        clinicId: clinic2.id,
        supplierId: clinic2Supplier.id,
        number: nextNumber(),
        status: "draft",
        totalCost: 500,
        createdById: owner2User.id,
      },
    });
    await prisma.supplierOrderItem.create({
      data: {
        clinicId: clinic2.id,
        supplierOrderId: clinic2Order.id,
        quantity: "1",
        unitCost: 500,
        nameSnapshot: "E2E-APPROVAL-Clinic2Item",
        unitSnapshot: "ədəd",
        priceSnapshot: "5.00",
        currencySnapshot: "AZN",
      },
    });

    // owner (clinic1) tries to confirm clinic2's order using clinic1's own valid token
    await owner.postForm(
      `/inventory/supplier-orders/${tokenSourceOrder.id}`,
      tokenSourcePage.html,
      { orderId: clinic2Order.id },
      "confirm-draft",
    );
    const clinic2OrderAfter = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: clinic2Order.id } });
    check(
      "H1: clinic1 owner cannot confirm clinic2's order",
      clinic2OrderAfter.status === "draft",
      `got ${clinic2OrderAfter.status}`,
    );

    await prisma.supplierOrderItem.deleteMany({ where: { supplierOrderId: clinic2Order.id } });
    await prisma.supplierOrder.delete({ where: { id: clinic2Order.id } });
    await prisma.supplier.delete({ where: { id: clinic2Supplier.id } });
  } else {
    console.log("  ~ H: skipped (no second clinic in seed)");
    passed++;
  }

  // ── I: permission ─────────────────────────────────────────────────────────
  console.log("\nI — permission (no inventory.manage cannot confirm)");
  const orderForPermissionTest = await createDraftOrder(true);
  const permTokenPage = await owner.get(`/inventory/supplier-orders/${orderForPermissionTest.id}`);

  const doctor = new Session();
  check("I1: doctor login ok", await doctor.login("hekim@demo.dentalpro.az"));
  // doctor's own view should not even show the confirm form (no inventory.manage)
  const doctorViewPage = await doctor.get(`/inventory/supplier-orders/${orderForPermissionTest.id}`);
  check("I2: doctor does not see confirm-draft form", !doctorViewPage.html.includes("confirm-draft"));

  // attempt server-side bypass: reuse owner's harvested tokens, but issue request as doctor
  await doctor.postForm(
    `/inventory/supplier-orders/${orderForPermissionTest.id}`,
    permTokenPage.html,
    { orderId: orderForPermissionTest.id },
    "confirm-draft",
  );
  const orderAfterDoctorAttempt = await prisma.supplierOrder.findUniqueOrThrow({
    where: { id: orderForPermissionTest.id },
  });
  check(
    "I3: doctor cannot confirm via direct action call (still draft)",
    orderAfterDoctorAttempt.status === "draft",
    `got ${orderAfterDoctorAttempt.status}`,
  );

  // ── J: super admin safety ────────────────────────────────────────────────
  console.log("\nJ — super admin safety");
  if (superAdminUser) {
    const saSession = new Session();
    check("J1: super admin login ok", await saSession.login(superAdminUser.email));
    await saSession.postForm(
      `/inventory/supplier-orders/${orderForPermissionTest.id}`,
      permTokenPage.html,
      { orderId: orderForPermissionTest.id },
      "confirm-draft",
    );
    const orderAfterSaAttempt = await prisma.supplierOrder.findUniqueOrThrow({
      where: { id: orderForPermissionTest.id },
    });
    check(
      "J2: super admin cannot confirm (still draft)",
      orderAfterSaAttempt.status === "draft",
      `got ${orderAfterSaAttempt.status}`,
    );
  } else {
    console.log("  ~ J: skipped (no super_admin user)");
    passed++;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  await cleanupAll();

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
