/**
 * E2E-проверка редактирования материала склада (Session 68):
 *   npx tsx scripts/e2e-inventory-edit-check.ts
 * Требует dev-сервер + seed. Техника: HTTP + cookie-jar + progressive-
 * enhancement формы server actions (как e2e-inventory-check.ts).
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

async function main() {
  console.log(`E2E inventory edit check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // сброс остатков прошлых прогонов
  const oldItems = await prisma.inventoryItem.findMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E Edit" } },
  });
  for (const it of oldItems) {
    await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: it.id } });
    await prisma.inventoryItem.delete({ where: { id: it.id } });
  }

  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));

  // 1. создаём тестовый материал через /inventory/new
  const newPage = await owner.get("/inventory/new");
  const created = await owner.postForm("/inventory/new", newPage.html, {
    name: "E2E Edit Material",
    unit: "qutu",
    initialQuantity: "7",
    minQuantity: "2",
    purchasePrice: "5,00",
    supplierName: "E2E Edit Supplier",
  });
  const itemId = (created.location ?? "").match(/\/inventory\/([0-9a-f-]{36})/)?.[1];
  check("материал для теста создан", created.status === 303 && !!itemId, `got ${created.status}`);

  // 2. страница редактирования открывается для owner (inventory.manage) и содержит текущие значения
  const editPage = await owner.get(`/inventory/${itemId}/edit`);
  check("edit-страница открывается (200)", editPage.status === 200);
  check("edit-страница: текущее имя в форме", editPage.html.includes('value="E2E Edit Material"'));
  check("edit-страница: текущий unit в форме", editPage.html.includes('value="qutu"'));
  check(
    "edit-страница: quantity НЕ редактируемое поле (нет input initialQuantity)",
    !editPage.html.includes('name="initialQuantity"'),
  );
  check(
    "edit-страница: текущий остаток показан как текст",
    /7<!--\s*-->\s*<!--\s*-->\s*qutu/.test(editPage.html),
  );

  // 3. неавторизованные роли не видят edit-страницу
  const doctor = new Session();
  check("login doctor", await doctor.login("hekim@demo.dentalpro.az"));
  const doctorEdit = await doctor.get(`/inventory/${itemId}/edit`);
  check("doctor: нет доступа к edit-странице (redirect)", doctorEdit.status !== 200, `got ${doctorEdit.status}`);

  const assistant = new Session();
  check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
  const asstEdit = await assistant.get(`/inventory/${itemId}/edit`);
  check("assistant: нет доступа к edit-странице (redirect)", asstEdit.status !== 200, `got ${asstEdit.status}`);

  // 4. doctor не может отправить update, даже имея валидную форму (action-токены owner'а + doctor-сессия)
  const beforeForgedAttempt = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId! } });
  await doctor.postForm(`/inventory/${itemId}/edit`, editPage.html, {
    id: itemId!,
    name: "HACKED",
    unit: "qutu",
    minQuantity: "2",
    purchaseToBaseFactor: "1",
  });
  const afterForgedAttempt = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId! } });
  check(
    "doctor: подменённый POST на update отклонён (имя не изменилось)",
    afterForgedAttempt.name === beforeForgedAttempt.name,
    `got ${afterForgedAttempt.name}`,
  );

  // 5. owner успешно редактирует: name/unit/purchaseUnit/factor/minStock/unitCost
  const updateRes = await owner.postForm(`/inventory/${itemId}/edit`, editPage.html, {
    id: itemId!,
    name: "E2E Edit Material (Updated)",
    unit: "ədəd",
    minQuantity: "9",
    purchasePrice: "11,25",
    purchaseUnit: "qutu",
    purchaseToBaseFactor: "20",
    supplierName: "E2E Edit Supplier Updated",
  });
  check("update → 303 redirect на карточку", updateRes.status === 303 && updateRes.location === `/inventory/${itemId}`);

  const updated = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: itemId! },
    include: { supplier: true },
  });
  check("name обновлён", updated.name === "E2E Edit Material (Updated)", `got ${updated.name}`);
  check("unit обновлён", updated.unit === "ədəd", `got ${updated.unit}`);
  check("purchaseUnit обновлён", updated.purchaseUnit === "qutu", `got ${updated.purchaseUnit}`);
  check("purchaseToBaseFactor обновлён", Number(updated.purchaseToBaseFactor) === 20, `got ${updated.purchaseToBaseFactor}`);
  check("minQuantity обновлён", Number(updated.minQuantity) === 9, `got ${updated.minQuantity}`);
  check("unitCost обновлён", updated.unitCost === 11_25, `got ${updated.unitCost}`);
  check("supplier обновлён (find-or-create)", updated.supplier?.name === "E2E Edit Supplier Updated");

  // 6. quantity НЕ изменилось при редактировании метаданных
  check("quantity не изменилось редактированием (остаток 7)", Number(updated.quantity) === 7, `got ${updated.quantity}`);

  // 7. audit log: update создан
  check(
    "audit: inventory_item update",
    !!(await prisma.auditLog.findFirst({
      where: { entityType: "inventory_item", entityId: itemId!, action: "update" },
    })),
  );

  // 8. список/карточка отражают новые значения
  const listPage = await owner.get("/inventory");
  check("список: новое имя отображается", listPage.html.includes("E2E Edit Material (Updated)"));
  const detailPage = await owner.get(`/inventory/${itemId}`);
  check("карточка: новый unit отображается", detailPage.html.includes("ədəd"));
  check(
    "карточка: stock-correction форма всё ещё доступна (quantity меняется только там)",
    detailPage.html.includes('data-e2e-marker="stock-correction-form"'),
  );

  // 9. чужая клиника: материал недоступен для edit (tenant isolation)
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-inv-edit-clinic-b" },
    update: {},
    create: { name: "E2E Inv Edit B", slug: "e2e-inv-edit-clinic-b", status: "active" },
  });
  const foreignItem = await prisma.inventoryItem.create({
    data: { clinicId: clinicB.id, name: "E2E Foreign Edit", unit: "ədəd", quantity: 5, minQuantity: 1 },
  });
  const foreignEditPage = await owner.get(`/inventory/${foreignItem.id}/edit`);
  check("чужой материал: edit-страница → 404", foreignEditPage.status === 404, `got ${foreignEditPage.status}`);

  await owner.postForm(`/inventory/${foreignItem.id}/edit`, editPage.html, {
    id: foreignItem.id,
    name: "HACKED FOREIGN",
    unit: "ədəd",
    minQuantity: "1",
    purchaseToBaseFactor: "1",
  });
  const foreignAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: foreignItem.id } });
  check("чужой материал: update не применён (tenant isolation)", foreignAfter.name === "E2E Foreign Edit");

  // 10. архивный (soft-deleted/inactive) материал не редактируется из обычного UI
  const archived = await prisma.inventoryItem.create({
    data: {
      clinicId: clinic.id,
      name: "E2E Edit Archived",
      unit: "ədəd",
      quantity: 3,
      minQuantity: 1,
      deletedAt: new Date(),
      isActive: false,
    },
  });
  const archivedEditPage = await owner.get(`/inventory/${archived.id}/edit`);
  check("архивный материал: edit-страница → 404", archivedEditPage.status === 404, `got ${archivedEditPage.status}`);

  // cleanup
  await prisma.inventoryItem.delete({ where: { id: foreignItem.id } });
  await prisma.clinic.delete({ where: { id: clinicB.id } });
  await prisma.inventoryItem.delete({ where: { id: archived.id } });
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: itemId! } });
  await prisma.inventoryItem.delete({ where: { id: itemId! } });
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
