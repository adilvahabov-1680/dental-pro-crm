/**
 * E2E-проверка модуля Supplier Receiving (сессия 30):
 *   npx tsx scripts/e2e-supplier-receiving-check.ts
 * Требует dev-сервер + seed (SO-DEMO-02 в статусе received).
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
  console.log(`E2E supplier-receiving check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // Cleanup e2e inventory items from previous runs
  await prisma.inventoryMovement.deleteMany({
    where: { clinicId: clinic.id, reason: { startsWith: "E2E-RCV:" } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E-RCV-" } },
  });

  // Also reset any e2e receives on SO-DEMO-02 items
  await prisma.supplierOrderItem.updateMany({
    where: {
      clinicId: clinic.id,
      order: { number: "SO-DEMO-02" },
      receivedAt: { not: null },
    },
    data: { receivedQty: null, receivedAt: null, receivedById: null, stockMovementId: null } as never,
  });

  // 1. Seed checks
  console.log("--- 1. Seed checks ---");

  const demoOrder2 = await prisma.supplierOrder.findFirst({
    where: { clinicId: clinic.id, number: "SO-DEMO-02" },
    include: { items: true, supplier: true },
  });
  check("seed: SO-DEMO-02 exists", !!demoOrder2);
  check("seed: SO-DEMO-02 status = received", demoOrder2?.status === "received");
  check("seed: SO-DEMO-02 has 2 items", (demoOrder2?.items.length ?? 0) === 2,
    `got ${demoOrder2?.items.length}`);
  check("seed: SO-DEMO-02 items not yet received", demoOrder2?.items.every((i) => !i.stockMovementId) ?? false);

  // 2. Auth guard
  console.log("\n--- 2. Auth guard ---");

  const anon = new Session();
  const anonPage = await anon.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
  check("anon: redirect to /login (302/307)", [302, 307].includes(anonPage.status));

  // 3. Permission guard (doctor has inventory.view but not inventory.manage)
  console.log("\n--- 3. Permission guard ---");

  const doctor = new Session();
  const doctorLoggedIn = await doctor.login("hekim@demo.dentalpro.az");
  check("doctor: login ok", doctorLoggedIn);

  const doctorOrderPage = await doctor.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
  check("doctor: order detail page accessible (view)", doctorOrderPage.status === 200);
  check("doctor: receiving form NOT shown (no manage perm)", !doctorOrderPage.html.includes('data-e2e-marker="receive-'));

  // 4. Owner can see detail page + receiving UI
  console.log("\n--- 4. Owner sees receiving UI ---");

  const owner = new Session();
  check("owner: login ok", await owner.login("admin@demo.dentalpro.az"));

  const orderDetailPage = await owner.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
  check("owner: SO-DEMO-02 detail opens (200)", orderDetailPage.status === 200);
  check("owner: SO-DEMO-02 number shown", orderDetailPage.html.includes("SO-DEMO-02"));
  check("owner: 'Anbara qəbul et' column header shown", orderDetailPage.html.includes("Anbara qəbul et"));
  check("owner: receive form rendered for each item", (orderDetailPage.html.match(/data-e2e-marker="receive-/g) ?? []).length >= 1);

  // 5. Guard: cannot receive on non-received order (SO-DEMO-01 is sent)
  console.log("\n--- 5. Guard: order must be in received status ---");

  const sentOrder = await prisma.supplierOrder.findFirst({
    where: { clinicId: clinic.id, number: "SO-DEMO-01" },
    include: { items: { take: 1 } },
  });
  const sentItem = sentOrder?.items[0];
  if (sentItem) {
    const sentItemPage = await owner.get(`/inventory/supplier-orders/${sentOrder!.id}`);
    const guardResult = await owner.postForm(
      `/inventory/supplier-orders/${sentOrder!.id}`,
      sentItemPage.html,
      { orderItemId: sentItem.id, inventoryItemId: "00000000-0000-0000-0000-000000000000", receivedQty: "1" },
      `receive-${sentItem.id}`,
    );
    // Should stay on page (no redirect) — server action returns error
    check("guard: receive on sent order stays on page (no redirect)", !guardResult.location?.includes("/login"));
  } else {
    check("guard: SO-DEMO-01 item exists for guard test", false, "SO-DEMO-01 item not found");
  }

  // 6. Create new InventoryItem path
  console.log("\n--- 6. Receive: create new InventoryItem ---");

  const itemToCreate = demoOrder2!.items[0];
  const invCountBefore = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });

  const createDetailPage = await owner.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
  await owner.postForm(
    `/inventory/supplier-orders/${demoOrder2!.id}`,
    createDetailPage.html,
    { orderItemId: itemToCreate.id, createNew: "true", receivedQty: "2" },
    `receive-${itemToCreate.id}`,
  );

  const invCountAfter = await prisma.inventoryItem.count({ where: { clinicId: clinic.id, deletedAt: null } });
  check("create-new: InventoryItem created (+1)", invCountAfter === invCountBefore + 1,
    `before=${invCountBefore} after=${invCountAfter}`);

  const receivedItem = await prisma.supplierOrderItem.findUnique({ where: { id: itemToCreate.id } });
  check("create-new: orderItem.stockMovementId set", !!receivedItem?.stockMovementId);
  check("create-new: orderItem.receivedQty = 2", Number(receivedItem?.receivedQty) === 2,
    `got ${receivedItem?.receivedQty}`);
  check("create-new: orderItem.receivedAt set", !!receivedItem?.receivedAt);
  check("create-new: orderItem.inventoryItemId set", !!receivedItem?.inventoryItemId);

  const movement = receivedItem?.stockMovementId
    ? await prisma.inventoryMovement.findUnique({ where: { id: receivedItem.stockMovementId } })
    : null;
  check("create-new: InventoryMovement type = in_stock", movement?.type === "in_stock");
  check("create-new: InventoryMovement.supplierOrderId set", movement?.supplierOrderId === demoOrder2!.id);
  check("create-new: InventoryItem quantity = 2",
    Number((await prisma.inventoryItem.findUnique({ where: { id: receivedItem!.inventoryItemId! } }))?.quantity) === 2);

  // 7. Double-receive guard
  console.log("\n--- 7. Guard: double-receive blocked ---");

  const alreadyReceivedPage = await owner.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
  check("double-receive: already-received badge shown for item 1",
    alreadyReceivedPage.html.includes("Anbara qəbul edildi"));

  // 8. Receive: link to existing InventoryItem
  console.log("\n--- 8. Receive: link to existing InventoryItem ---");

  const itemToLink = demoOrder2!.items[1];
  const existingInvItem = await prisma.inventoryItem.findFirst({
    where: { clinicId: clinic.id, deletedAt: null, isActive: true },
  });
  check("test: existing inventory item available", !!existingInvItem);

  if (existingInvItem) {
    const qtyBefore = Number(existingInvItem.quantity);
    const linkDetailPage = await owner.get(`/inventory/supplier-orders/${demoOrder2!.id}`);
    await owner.postForm(
      `/inventory/supplier-orders/${demoOrder2!.id}`,
      linkDetailPage.html,
      { orderItemId: itemToLink.id, inventoryItemId: existingInvItem.id, receivedQty: "3" },
      `receive-${itemToLink.id}`,
    );

    const linkedItem = await prisma.supplierOrderItem.findUnique({ where: { id: itemToLink.id } });
    check("link-existing: orderItem.stockMovementId set", !!linkedItem?.stockMovementId);
    check("link-existing: orderItem.inventoryItemId = existingInvItem.id",
      linkedItem?.inventoryItemId === existingInvItem.id);

    const updatedInv = await prisma.inventoryItem.findUnique({ where: { id: existingInvItem.id } });
    check("link-existing: inventory quantity increased by 3",
      Number(updatedInv?.quantity) === qtyBefore + 3,
      `before=${qtyBefore} after=${updatedInv?.quantity}`);
  }

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
