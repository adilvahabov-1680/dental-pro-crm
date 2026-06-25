/**
 * E2E-проверка архивации материала склада (Session 77):
 *   npx tsx scripts/e2e-inventory-archive-check.ts
 * Требует dev-сервер + seed (demo-klinika). Техника: HTTP + cookie-jar
 * (как другие e2e-скрипты модуля). Тестовые записи — маркер "E2E Archive".
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
    // страница может содержать несколько форм (stock-correction + archive) —
    // если задан markerAttr, ограничиваем поиск hidden-полей именно этой формой
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
  console.log(`E2E inventory archive check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctorRecord = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const patient = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const ownerUser = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id, role: { key: "owner" } } });

  // cleanup от прошлых прогонов
  const oldItem = await prisma.inventoryItem.findFirst({ where: { clinicId: clinic.id, name: "E2E Archive Material" } });
  if (oldItem) {
    await prisma.treatmentConsumableUsage.deleteMany({ where: { inventoryItemId: oldItem.id } });
    await prisma.serviceConsumableTemplate.deleteMany({ where: { inventoryItemId: oldItem.id } });
    await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: oldItem.id } });
    await prisma.inventoryItem.delete({ where: { id: oldItem.id } });
  }
  await prisma.treatmentItem.deleteMany({ where: { notes: "e2e-archive-treatment" } });
  await prisma.service.deleteMany({ where: { clinicId: clinic.id, name: "E2E-Archive-Svc" } });

  // ── Setup ────────────────────────────────────────────────────────────────────
  console.log("Setup — creating test data…");
  const svc = await prisma.service.create({ data: { clinicId: clinic.id, name: "E2E-Archive-Svc", isActive: true } });

  const item = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E Archive Material", unit: "ədəd", quantity: 50, minQuantity: 5, unitCost: 100 },
  });
  await prisma.inventoryMovement.create({
    data: { clinicId: clinic.id, inventoryItemId: item.id, type: "in_stock", quantity: 50, reason: "E2E initial", performedById: ownerUser.id },
  });

  const template = await prisma.serviceConsumableTemplate.create({
    data: { clinicId: clinic.id, serviceId: svc.id, inventoryItemId: item.id, quantity: 1, unit: "ədəd" },
  });

  // историческое (уже применённое) списание — должно остаться нетронутым после архивации
  const treatment = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id, patientId: patient.id, doctorId: doctorRecord.id, serviceId: svc.id,
      status: "done", price: 1000, performedAt: new Date(), notes: "e2e-archive-treatment",
    },
  });
  const movement = await prisma.inventoryMovement.create({
    data: { clinicId: clinic.id, inventoryItemId: item.id, type: "treatment_usage", quantity: 2, unitCost: 100, treatmentItemId: treatment.id, performedById: ownerUser.id },
  });
  await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id, treatmentItemId: treatment.id, serviceId: svc.id, inventoryItemId: item.id, templateId: template.id,
      quantity: 2, unit: "ədəd", baseQuantity: 2, baseUnit: "ədəd", inventoryMovementId: movement.id, createdById: ownerUser.id,
    },
  });
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: 48 } });

  const movementsBefore = await prisma.inventoryMovement.count({ where: { inventoryItemId: item.id } });
  const usagesBefore = await prisma.treatmentConsumableUsage.count({ where: { inventoryItemId: item.id } });
  const qtyBefore = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity;

  // ── A. UI visibility ──────────────────────────────────────────────────────────
  console.log("\nA. Visibility of the archive button");
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const ownerDetail = await owner.get(`/inventory/${item.id}`);
  check("owner: detail page opens (200)", ownerDetail.status === 200);
  check("owner: видит кнопку 'Arxivləşdir'", ownerDetail.html.includes("Arxivləşdir"));
  check("owner: видит предупреждение про tarixçə", ownerDetail.html.includes("Tarixçə saxlanılacaq"));

  const doctor = new Session();
  check("login doctor", await doctor.login("hekim@demo.dentalpro.az"));
  const doctorDetail = await doctor.get(`/inventory/${item.id}`);
  check("doctor: нет кнопки 'Arxivləşdir' (нет inventory.manage)", !doctorDetail.html.includes("Arxivləşdir"));

  // ── B. Forged POST from unauthorized role ───────────────────────────────────
  console.log("\nB. Forged POST rejected");
  await doctor.postForm(`/inventory/${item.id}`, ownerDetail.html, { id: item.id }, "archive-inventory-item-form");
  const afterForged = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  check("doctor: подменённый POST не архивировал материал", afterForged.isActive === true && afterForged.deletedAt === null);

  // ── C. Cross-clinic isolation ────────────────────────────────────────────────
  console.log("\nC. Cross-clinic isolation");
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-archive-clinic-b" },
    update: {},
    create: { name: "E2E Archive B", slug: "e2e-archive-clinic-b", status: "active" },
  });
  const foreignItem = await prisma.inventoryItem.create({
    data: { clinicId: clinicB.id, name: "E2E Archive Foreign", unit: "ədəd", quantity: 5, minQuantity: 1 },
  });
  await owner.postForm(`/inventory/${foreignItem.id}`, ownerDetail.html, { id: foreignItem.id }, "archive-inventory-item-form");
  const foreignAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: foreignItem.id } });
  check("owner: чужой материал не архивирован (tenant isolation)", foreignAfter.isActive === true && foreignAfter.deletedAt === null);

  // ── D. Real archive by owner ─────────────────────────────────────────────────
  console.log("\nD. Owner archives the item");
  const archiveRes = await owner.postForm(`/inventory/${item.id}`, ownerDetail.html, { id: item.id }, "archive-inventory-item-form");
  check("archive → 303 redirect на /inventory", archiveRes.status === 303 && archiveRes.location === "/inventory");

  const archived = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  check("isActive=false", archived.isActive === false);
  check("deletedAt установлен", archived.deletedAt !== null);
  check("quantity не изменилось архивацией", Number(archived.quantity) === Number(qtyBefore), `before=${qtyBefore} after=${archived.quantity}`);

  const movementsAfter = await prisma.inventoryMovement.count({ where: { inventoryItemId: item.id } });
  const usagesAfter = await prisma.treatmentConsumableUsage.count({ where: { inventoryItemId: item.id } });
  check("движения не удалены", movementsAfter === movementsBefore, `before=${movementsBefore} after=${movementsAfter}`);
  check("история списаний не удалена", usagesAfter === usagesBefore, `before=${usagesBefore} after=${usagesAfter}`);

  const templateAfter = await prisma.serviceConsumableTemplate.findUnique({ where: { id: template.id } });
  check("шаблон расхода удалён (не предлагается на будущее)", templateAfter === null);

  const usageStillLinked = await prisma.treatmentConsumableUsage.findFirst({ where: { treatmentItemId: treatment.id } });
  check("историческая запись usage сохранилась (templateId → null допустим)", !!usageStillLinked);

  const auditEntry = await prisma.auditLog.findFirst({
    where: { entityType: "inventory_item", entityId: item.id, action: "update" },
    orderBy: { createdAt: "desc" },
  });
  check("audit log записан", !!auditEntry);

  // ── E. Normal UI behavior after archive ──────────────────────────────────────
  console.log("\nE. Normal UI behavior after archive");
  const listPage = await owner.get("/inventory");
  check("архивный материал не виден в списке /inventory", !listPage.html.includes("E2E Archive Material"));

  const detailAfter = await owner.get(`/inventory/${item.id}`);
  check("/inventory/[id] → 404 после архивации", detailAfter.status === 404);

  const editAfter = await owner.get(`/inventory/${item.id}/edit`);
  check("/inventory/[id]/edit → 404 после архивации", editAfter.status === 404);

  // ── F. Historical reports still work ─────────────────────────────────────────
  console.log("\nF. Historical reports unaffected");
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const consumablesReport = await owner.get(`/reports/consumables?from=${today}&to=${today}`);
  check("/reports/consumables всё ещё показывает архивный материал по имени", consumablesReport.html.includes("E2E Archive Material"));

  const dailyReport = await owner.get(`/reports/daily-doctor?date=${today}`);
  check("/reports/daily-doctor всё ещё показывает архивный материал в истории", dailyReport.html.includes("E2E Archive Material"));

  // ── G. Idempotency: re-archiving already-archived item ──────────────────────
  console.log("\nG. Re-archive is a safe no-op");
  const reArchive = await owner.postForm(`/inventory/${item.id}`, ownerDetail.html, { id: item.id }, "archive-inventory-item-form");
  check("повторная архивация: не 303 (itemNotFound, без редиректа)", reArchive.status !== 303);
  const stillArchived = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  check("deletedAt не изменился повторным вызовом", stillArchived.deletedAt?.getTime() === archived.deletedAt?.getTime());

  // ── cleanup ──────────────────────────────────────────────────────────────────
  await prisma.treatmentConsumableUsage.deleteMany({ where: { treatmentItemId: treatment.id } });
  await prisma.treatmentItem.delete({ where: { id: treatment.id } });
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: item.id } });
  await prisma.inventoryItem.delete({ where: { id: item.id } });
  await prisma.inventoryItem.delete({ where: { id: foreignItem.id } });
  await prisma.clinic.delete({ where: { id: clinicB.id } });
  await prisma.service.delete({ where: { id: svc.id } });
  console.log("\n  (временные данные e2e удалены)");

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
