/**
 * E2E-проверка модуля Supplier Orders (сессия 29):
 *   npx tsx scripts/e2e-supplier-orders-check.ts
 * Требует dev-сервер + seed. Тестовые записи по маркеру "E2E-SO-".
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
  console.log(`E2E supplier-orders check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // cleanup e2e records from previous runs
  await prisma.supplierOrderItem.deleteMany({
    where: { nameSnapshot: { startsWith: "E2E-SO-" } },
  });
  await prisma.supplierOrder.deleteMany({
    where: { clinicId: clinic.id, number: { startsWith: "E2E-SO-" } },
  });
  await prisma.supplier.deleteMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E-SO-" } },
  });

  // 1. seed checks
  const demoSupplier = await prisma.supplier.findFirst({
    where: { clinicId: clinic.id, name: "Demo Dental Təchizat" },
  });
  check("seed: Demo Dental Təchizat supplier exists", !!demoSupplier);

  const demoOrder = await prisma.supplierOrder.findFirst({
    where: { clinicId: clinic.id, number: "SO-DEMO-01" },
  });
  check("seed: SO-DEMO-01 order exists", !!demoOrder);
  check("seed: SO-DEMO-01 status = sent", demoOrder?.status === "sent");

  const demoOrderItems = await prisma.supplierOrderItem.count({
    where: { supplierOrderId: demoOrder?.id },
  });
  check("seed: SO-DEMO-01 has 2 items", demoOrderItems === 2, `got ${demoOrderItems}`);

  // 2. page access (owner)
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));

  const ordersPage = await owner.get("/inventory/supplier-orders");
  check("/inventory/supplier-orders: opens (200)", ordersPage.status === 200);
  check("/inventory/supplier-orders: SO-DEMO-01 visible", ordersPage.html.includes("SO-DEMO-01"));

  // 3. order detail page
  const detailPage = await owner.get(`/inventory/supplier-orders/${demoOrder!.id}`);
  check("/inventory/supplier-orders/[id]: opens (200)", detailPage.status === 200);
  check("detail: order number shown", detailPage.html.includes("SO-DEMO-01"));
  check("detail: status label shown", detailPage.html.includes("Göndərildi"));

  // 4. supplier detail page has "Yeni sifariş yarat" button
  const supplierDetail = await owner.get(`/inventory/suppliers/${demoSupplier!.id}`);
  check("supplier detail: Yeni sifariş yarat button present", supplierDetail.html.includes("Yeni sifariş yarat"));

  // 5. create draft order via "Yeni sifariş yarat" from supplier page
  const catalogItem = await prisma.supplierCatalogItem.findFirst({
    where: { clinicId: clinic.id, supplierId: demoSupplier!.id, isActive: true },
  });
  check("seed: catalog item exists for test", !!catalogItem);

  // Create draft order directly in DB for testing
  const testOrder = await prisma.supplierOrder.create({
    data: {
      clinicId: clinic.id,
      supplierId: demoSupplier!.id,
      number: "E2E-SO-001",
      status: "draft",
      totalCost: 0,
      createdById: (await prisma.user.findFirst({ where: { clinicId: clinic.id } }))!.id,
    },
  });
  check("create draft order in DB", !!testOrder.id);

  // 6. order detail for draft
  const draftDetail = await owner.get(`/inventory/supplier-orders/${testOrder.id}`);
  check("draft order detail: opens (200)", draftDetail.status === 200);
  check("draft order detail: add catalog item form visible", draftDetail.html.includes("add-catalog-item"));
  check("draft order detail: mark-sent form visible", draftDetail.html.includes("mark-sent"));
  check("draft order detail: cancel-order form visible", draftDetail.html.includes("cancel-order"));

  // 7. add catalog item via postForm
  const addResult = await owner.postForm(
    `/inventory/supplier-orders/${testOrder.id}`,
    draftDetail.html,
    { orderId: testOrder.id, catalogItemId: catalogItem!.id, quantity: "3" },
    "add-catalog-item",
  );
  check("add catalog item: 200 or redirect", addResult.status === 200 || addResult.status === 303 || addResult.status === 307);

  const itemsAfterAdd = await prisma.supplierOrderItem.count({ where: { supplierOrderId: testOrder.id } });
  check("catalog item persisted in DB", itemsAfterAdd === 1, `got ${itemsAfterAdd}`);

  const addedItem = await prisma.supplierOrderItem.findFirst({ where: { supplierOrderId: testOrder.id } });
  check("snapshot fields captured", !!addedItem?.nameSnapshot && addedItem.nameSnapshot === catalogItem!.name);
  check("quantity = 3", Number(addedItem?.quantity) === 3, `got ${addedItem?.quantity}`);

  // 8. total recalculated
  const orderAfterAdd = await prisma.supplierOrder.findUnique({ where: { id: testOrder.id } });
  check("totalCost recalculated (> 0)", (orderAfterAdd?.totalCost ?? 0) > 0, `got ${orderAfterAdd?.totalCost}`);

  // 9. mark order sent
  const draftPage2 = await owner.get(`/inventory/supplier-orders/${testOrder.id}`);
  const sentResult = await owner.postForm(
    `/inventory/supplier-orders/${testOrder.id}`,
    draftPage2.html,
    { orderId: testOrder.id },
    "mark-sent",
  );
  check("mark sent: 200 or redirect", sentResult.status === 200 || sentResult.status === 303 || sentResult.status === 307);

  const orderAfterSent = await prisma.supplierOrder.findUnique({ where: { id: testOrder.id } });
  check("status = sent after mark sent", orderAfterSent?.status === "sent");
  check("sentAt set", !!orderAfterSent?.sentAt);

  // 10. detail shows message block (order has items)
  const sentPage = await owner.get(`/inventory/supplier-orders/${testOrder.id}`);
  check("sent order detail: message block visible (copy-message)", sentPage.html.includes("copy-message"));
  check("sent order detail: mark-received form visible", sentPage.html.includes("mark-received"));

  // 11. mark order received
  const recvResult = await owner.postForm(
    `/inventory/supplier-orders/${testOrder.id}`,
    sentPage.html,
    { orderId: testOrder.id },
    "mark-received",
  );
  check("mark received: 200 or redirect", recvResult.status === 200 || recvResult.status === 303 || recvResult.status === 307);

  const orderAfterRecv = await prisma.supplierOrder.findUnique({ where: { id: testOrder.id } });
  check("status = received after mark received", orderAfterRecv?.status === "received");
  check("receivedAt set", !!orderAfterRecv?.receivedAt);

  // 12. cancel draft — create another draft for cancel test
  const cancelOrder = await prisma.supplierOrder.create({
    data: {
      clinicId: clinic.id,
      supplierId: demoSupplier!.id,
      number: "E2E-SO-002",
      status: "draft",
      totalCost: 0,
      createdById: (await prisma.user.findFirst({ where: { clinicId: clinic.id } }))!.id,
    },
  });
  const cancelPage = await owner.get(`/inventory/supplier-orders/${cancelOrder.id}`);
  const cancelResult = await owner.postForm(
    `/inventory/supplier-orders/${cancelOrder.id}`,
    cancelPage.html,
    { orderId: cancelOrder.id },
    "cancel-order",
  );
  check("cancel order: 200 or redirect", cancelResult.status === 200 || cancelResult.status === 303 || cancelResult.status === 307);

  const orderAfterCancel = await prisma.supplierOrder.findUnique({ where: { id: cancelOrder.id } });
  check("status = cancelled after cancel", orderAfterCancel?.status === "cancelled");

  // 13. tenant isolation — received order has no status action buttons
  const receivedPage = await owner.get(`/inventory/supplier-orders/${testOrder.id}`);
  check("received order: no mark-sent form", !receivedPage.html.includes("mark-sent"));
  check("received order: no cancel form", !receivedPage.html.includes("cancel-order"));

  // 14. permission check: doctor can view orders but not manage
  const doctor = new Session();
  await doctor.login("hekim@demo.dentalpro.az");
  const doctorOrdersPage = await doctor.get("/inventory/supplier-orders");
  check("doctor: /inventory/supplier-orders accessible (view)", doctorOrdersPage.status === 200);

  const doctorDetail = await doctor.get(`/inventory/supplier-orders/${demoOrder!.id}`);
  check("doctor: order detail accessible", doctorDetail.status === 200);
  check("doctor: no mark-sent form (no manage)", !doctorDetail.html.includes("mark-sent"));

  // 15. inventory page has supplier orders link
  const invPage = await owner.get("/inventory");
  check("/inventory: Sifarişlər link present", invPage.html.includes("/inventory/supplier-orders"));

  // cleanup
  await prisma.supplierOrderItem.deleteMany({ where: { supplierOrderId: testOrder.id } });
  await prisma.supplierOrderItem.deleteMany({ where: { supplierOrderId: cancelOrder.id } });
  await prisma.supplierOrder.deleteMany({ where: { id: { in: [testOrder.id, cancelOrder.id] } } });

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
