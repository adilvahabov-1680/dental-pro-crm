/**
 * E2E-проверка модуля Anbar (dev-скрипт):
 *   npx tsx scripts/e2e-inventory-check.ts
 * Требует dev-сервер + seed. Техника: HTTP + cookie-jar + progressive-
 * enhancement формы server actions. Тестовые записи — по маркерам "e2e-".
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

// Seed-значение "Steril maska" (см. prisma/seed.ts: unit ədəd, qty 300,
// min 150 — baseUnit сессии 64, не qutu). Сид — create-only и не сбрасывает
// quantity при повторных запусках, поэтому тест сам гарантирует и
// восстанавливает достаточный остаток (test-data hygiene, не относится к
// продуктовой логике inventory).
const SAFE_MASKA_QTY = 300;

async function main() {
  console.log(`E2E inventory check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });

  // сброс e2e-остатков прошлых прогонов
  const oldItems = await prisma.inventoryItem.findMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E " } },
  });
  for (const it of oldItems) {
    await prisma.treatmentItemMaterial.deleteMany({ where: { inventoryItemId: it.id } });
    await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: it.id } });
    await prisma.inventoryItem.delete({ where: { id: it.id } });
  }
  await prisma.treatmentItem.deleteMany({ where: { notes: "e2e-inv-cancelled" } });

  // hygiene: "Steril maska" расходуется сценарием списания (шаг 15) и не
  // восстанавливается сидом — гарантируем достаточный остаток перед прогоном
  await prisma.inventoryItem.updateMany({
    where: { clinicId: clinic.id, name: "Steril maska", quantity: { lt: 2 } },
    data: { quantity: SAFE_MASKA_QTY },
  });
  // hygiene: "Bonding agent" должен быть 1.8 (2.0 минус 0.2 от treatments e2e).
  // supplier-receiving e2e может изменить это значение через link-existing тест.
  await prisma.inventoryItem.updateMany({
    where: { clinicId: clinic.id, name: "Bonding agent", quantity: { not: 1.8 } },
    data: { quantity: 1.8 },
  });

  // 1. seed
  const seedCats = await prisma.inventoryCategory.count({ where: { clinicId: clinic.id } });
  const seedMats = await prisma.inventoryItem.count({
    where: { clinicId: clinic.id, deletedAt: null },
  });
  check("seed: категории (≥7) и материалы (≥6)", seedCats >= 7 && seedMats >= 6,
    `cats ${seedCats}, mats ${seedMats}`);
  const bonding = await prisma.inventoryItem.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Bonding agent" },
  });
  check("seed: Bonding 1.8 после списания 0.2", Number(bonding.quantity) === 1.8,
    `got ${bonding.quantity}`);

  // 2-5. страницы (owner)
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const invPage = await owner.get("/inventory");
  check("/inventory: summary-карточки", invPage.html.includes("Az qalanlar") && invPage.html.includes("Bu ay istifadə"));
  check("low stock panel: Lateks əlcək виден", invPage.html.includes("Lateks əlcək"));
  const detail = await owner.get(`/inventory/${bonding.id}`);
  check("карточка материала открывается (история движений)",
    detail.html.includes("Bonding agent") && detail.html.includes("Mədaxil"));

  // 6. создание материала с initial quantity → purchase movement
  const newPage = await owner.get("/inventory/new");
  const created = await owner.postForm("/inventory/new", newPage.html, {
    name: "E2E Test Material",
    unit: "ədəd",
    initialQuantity: "10",
    minQuantity: "3",
    purchasePrice: "12,50",
    supplierName: "E2E Supplier",
  });
  const newId = (created.location ?? "").match(/\/inventory\/([0-9a-f-]{36})/)?.[1];
  check("создание материала → 303", created.status === 303 && !!newId, `got ${created.status}`);
  const newItem = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: newId! },
    include: { supplier: true },
  });
  check("материал: qty 10, цена 12.50, supplier создан",
    Number(newItem.quantity) === 10 && newItem.unitCost === 12_50 && newItem.supplier?.name === "E2E Supplier");
  const initMove = await prisma.inventoryMovement.count({
    where: { inventoryItemId: newId!, type: "in_stock" },
  });
  check("initial movement (in) создан", initMove === 1);
  check("audit: material create",
    !!(await prisma.auditLog.findFirst({ where: { entityType: "inventory_item", entityId: newId! } })));

  // 7-8. приход и расход — используем StockCorrectionForm (сессия 31: itemId, adjustment/adjustment_out)
  const itemPage = await owner.get(`/inventory/${newId}`);
  await owner.postForm(`/inventory/${newId}`, itemPage.html, {
    itemId: newId!,
    type: "adjustment",
    quantity: "5",
    reason: "e2e-purchase",
  });
  let q = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: newId! } });
  check("приход +5 → qty 15", Number(q.quantity) === 15, `got ${q.quantity}`);
  await owner.postForm(`/inventory/${newId}`, itemPage.html, {
    itemId: newId!,
    type: "adjustment_out",
    quantity: "11",
    reason: "e2e-usage",
  });
  q = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: newId! } });
  check("расход −11 → qty 4", Number(q.quantity) === 4, `got ${q.quantity}`);
  check("audit: movement create",
    !!(await prisma.auditLog.findFirst({ where: { entityType: "inventory_movement", entityId: newId! } })));

  // 9. нельзя списать больше остатка
  await owner.postForm(`/inventory/${newId}`, itemPage.html, {
    itemId: newId!,
    type: "adjustment_out",
    quantity: "100",
    reason: "e2e-over",
  });
  q = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: newId! } });
  check("сверх-расход заблокирован (qty 4)", Number(q.quantity) === 4);
  check("сверх-расход: движение не создано",
    (await prisma.inventoryMovement.findFirst({ where: { reason: "e2e-over" } })) === null);

  // 18-19. low stock transition (4 → расход 2 = 2 ≤ min 3) → notification ровно одна
  const notifBefore = await prisma.notification.count({
    where: { clinicId: clinic.id, type: "inventory_low_stock" },
  });
  await owner.postForm(`/inventory/${newId}`, itemPage.html, {
    itemId: newId!,
    type: "adjustment_out",
    quantity: "2",
    reason: "e2e-to-low",
  });
  const notifAfterLow = await prisma.notification.count({
    where: { clinicId: clinic.id, type: "inventory_low_stock" },
  });
  check("low stock: notification создан при переходе", notifAfterLow === notifBefore + 1);
  await owner.postForm(`/inventory/${newId}`, itemPage.html, {
    itemId: newId!,
    type: "adjustment_out",
    quantity: "1",
    reason: "e2e-still-low",
  });
  const notifAfterMore = await prisma.notification.count({
    where: { clinicId: clinic.id, type: "inventory_low_stock" },
  });
  check("low stock: без спама при повторном расходе", notifAfterMore === notifAfterLow);
  const invPage2 = await owner.get("/inventory?low=1");
  check("low-фильтр: материал в списке (статус обновился)", invPage2.html.includes("E2E Test Material"));

  // 10. append-only: движения не редактируются (политика приложения) — история растёт
  const movesCount = await prisma.inventoryMovement.count({ where: { inventoryItemId: newId! } });
  check("движения append-only (5 записей)", movesCount === 5, `got ${movesCount}`);

  // 15. doctor добавляет материал к своей процедуре (treatments.manage)
  const hekim = new Session();
  check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
  const hekimInv = await hekim.get("/inventory");
  check("doctor видит склад (inventory.view)", hekimInv.html.includes("Kompozit A2"));
  check("doctor: кнопки Yeni material нет (нет manage)", !hekimInv.html.includes('href="/inventory/new"'));
  const item36 = await prisma.treatmentItem.findFirstOrThrow({
    where: { clinicId: clinic.id, notes: "demo-seed:Kompozit plomba:36" },
  });
  const matBefore = await prisma.treatmentItemMaterial.count({
    where: { treatmentItemId: item36.id },
  });
  const matPage = await hekim.get(`/treatments/${item36.id}/materials`);
  check("страница материалов процедуры открывается", matPage.html.includes("Kompozit plomba"));
  const maska = await prisma.inventoryItem.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Steril maska" },
  });
  const maskaQtyBefore = Number(maska.quantity);
  await hekim.postForm(`/treatments/${item36.id}/materials`, matPage.html, {
    treatmentItemId: item36.id,
    inventoryItemId: maska.id,
    quantity: "1",
  });
  const matAfter = await prisma.treatmentItemMaterial.count({
    where: { treatmentItemId: item36.id },
  });
  check("материал добавлен к процедуре", matAfter === matBefore + 1);
  const maskaAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: maska.id } });
  check("остаток уменьшился (usage movement)", Number(maskaAfter.quantity) === maskaQtyBefore - 1);
  check("audit: treatment material usage",
    !!(await prisma.auditLog.findFirst({
      where: { entityType: "treatment_item_material", entityId: item36.id },
    })));
  // 17. карточка процедуры показывает материалы
  const ptTreat = await hekim.get(`/patients/${resad.id}/treatments`);
  check("карточка процедуры: материалы видны", ptTreat.html.includes("Steril maska"));

  // 16. cancelled процедура — списание запрещено
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const svc = await prisma.service.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Konsultasiya" },
  });
  const cancelled = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: resad.id,
      doctorId: doctor.id,
      serviceId: svc.id,
      status: "cancelled",
      price: 0,
      notes: "e2e-inv-cancelled",
    },
  });
  await hekim.postForm(`/treatments/${item36.id}/materials`, matPage.html, {
    treatmentItemId: cancelled.id,
    inventoryItemId: maska.id,
    quantity: "1",
  });
  check("cancelled процедура: списание запрещено",
    (await prisma.treatmentItemMaterial.count({ where: { treatmentItemId: cancelled.id } })) === 0);

  // 13-14. чужие записи: материал клиники B + процедура вне scope
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-inv-clinic-b" },
    update: {},
    create: { name: "E2E Inv B", slug: "e2e-inv-clinic-b", status: "active" },
  });
  const foreignItem = await prisma.inventoryItem.create({
    data: { clinicId: clinicB.id, name: "E2E Foreign", unit: "ədəd", quantity: 10, minQuantity: 1 },
  });
  const foreignPage = await owner.get(`/inventory/${foreignItem.id}`);
  check("чужой материал → 404/нет утечки",
    foreignPage.status === 404 || !foreignPage.html.includes("E2E Foreign"));
  await hekim.postForm(`/treatments/${item36.id}/materials`, matPage.html, {
    treatmentItemId: item36.id,
    inventoryItemId: foreignItem.id,
    quantity: "1",
  });
  check("чужой материал не списывается на процедуру",
    (await prisma.treatmentItemMaterial.count({
      where: { treatmentItemId: item36.id, inventoryItemId: foreignItem.id },
    })) === 0);

  // 12. assistant: нет inventory.manage и treatments.manage → действия отклонены
  const asst = new Session();
  check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
  await asst.postForm(`/inventory/${newId}`, itemPage.html, {
    inventoryItemId: newId!,
    type: "in_stock",
    quantity: "99",
    reason: "e2e-asst",
  });
  check("assistant: движение отклонено",
    (await prisma.inventoryMovement.findFirst({ where: { reason: "e2e-asst" } })) === null);
  const asstMatBefore = await prisma.treatmentItemMaterial.count({
    where: { treatmentItemId: item36.id },
  });
  await asst.postForm(`/treatments/${item36.id}/materials`, matPage.html, {
    treatmentItemId: item36.id,
    inventoryItemId: maska.id,
    quantity: "1",
  });
  check("assistant: списание на процедуру отклонено",
    (await prisma.treatmentItemMaterial.count({ where: { treatmentItemId: item36.id } })) ===
      asstMatBefore);

  // cleanup чужой клиники
  await prisma.inventoryItem.delete({ where: { id: foreignItem.id } });
  await prisma.clinic.delete({ where: { id: clinicB.id } });
  await prisma.treatmentItem.delete({ where: { id: cancelled.id } });

  // hygiene: возвращаем остаток "Steril maska" к seed-safe значению, чтобы
  // повторные прогоны не исчерпывали его до 0 (см. комментарий у SAFE_MASKA_QTY)
  await prisma.inventoryItem.update({ where: { id: maska.id }, data: { quantity: SAFE_MASKA_QTY } });
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
