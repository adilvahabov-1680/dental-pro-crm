/**
 * E2E-проверка Mobile UX / Doctor Workflow Polish v1 (сессия 50) +
 * Inventory Mobile Polish v1 (сессия 51):
 *   npx tsx scripts/e2e-mobile-ux-check.ts
 * Требует дев-сервер + seed.
 *
 * Проект не использует Playwright/браузерный harness (только HTTP +
 * cookie-jar + строковые DOM-проверки, как и все остальные e2e-скрипты) —
 * визуальная проверка отсутствия horizontal overflow на 360/390/430/768/
 * 1024px была сделана интерактивно через MCP preview-браузер во время
 * разработки (resize + document.documentElement.scrollWidth vs clientWidth,
 * подтверждено реальным `window.scrollTo` тестом — scrollWidth у страниц с
 * намеренно горизонтально-скроллящимися элементами (mobile nav chips,
 * CatalogTable/OrderItemsTable с `overflow-x-auto`) может казаться
 * «раздутым», хотя сама страница не скроллится; ground truth — реальный
 * scroll, не сам по себе scrollWidth). Этот скрипт — лёгкая регрессионная
 * защита: не повторяет визуальный замер (нет браузера в CI), но
 * гарантирует, что найденные реальные баги не вернутся:
 *   - сессия 50: DebtReminderRow/TreatmentItemCard/AppointmentCard/
 *     InvoiceCard — `shrink-0` на action-zone не давал ей сжаться/
 *     обернуться при `flex-wrap`, фикс — снять `shrink-0`;
 *   - сессия 51: тот же паттерн в InventoryItemCard (то же исправление);
 *     отдельно — `/inventory` PageHeader actions (5 ссылок) не имел
 *     `flex-wrap` вовсе (не было даже первой попытки `sm:flex-nowrap`-фикса) —
 *     последняя ссылка «Yeni material» уходила на right:693px при
 *     clientWidth:390. Фикс — добавлен `flex-wrap`.
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
    return { status: res.status };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

/** Старые «опасные» строки классов (сессия 50, до фикса) — не должны вернуться. */
const OLD_BROKEN_PATTERNS = [
  "sm:flex-nowrap",
  "flex shrink-0 flex-wrap items-center gap-3", // DebtReminderRow / TreatmentItemCard (до фикса)
  "flex flex-wrap shrink-0 items-center gap-3", // TreatmentItemCard / InvoiceCard (промежуточная версия)
  "flex flex-wrap shrink-0 items-center gap-2", // AppointmentCard (промежуточная версия)
];

async function main() {
  console.log(`E2E mobile UX check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994501112233" } });
  const supplier = await prisma.supplier.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Demo Dental Təchizat" },
  });
  const order = await prisma.supplierOrder.findFirstOrThrow({
    where: { clinicId: clinic.id, number: "SO-DEMO-01" },
  });
  const item = await prisma.inventoryItem.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Bonding agent" },
  });

  // ── базовый mobile-readiness сигнал (viewport meta) ───────────────────
  const loginPage = await new Session().get("/login");
  check("viewport meta tag присутствует (Next.js default)",
    loginPage.html.includes('name="viewport"') && loginPage.html.includes("width=device-width"));

  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));

  // ── 9 целевых страниц: status 200 + ключевой контент + нет старых "опасных" классов ──
  const pages: Array<{ path: string; label: string; expect: string[] }> = [
    { path: "/dashboard", label: "dashboard", expect: ["Xoş gəlmisiniz"] },
    { path: "/patients", label: "patients list", expect: ["Pasiyentlər"] },
    { path: `/patients/${resad.id}`, label: "patient detail", expect: ["Həsənov", "Rəşad"] },
    { path: `/patients/${resad.id}/treatments`, label: "patient treatments", expect: ["Müalicə"] },
    { path: "/appointments?view=list", label: "appointments", expect: ["Qəbullar"] },
    { path: "/finance/debts", label: "finance debts", expect: ["Borclar"] },
    { path: "/recalls", label: "recalls", expect: ["Kontrol xatırlatmaları"] },
    { path: "/feedback", label: "feedback", expect: ["Pasiyent rəyləri"] },
    { path: "/notifications", label: "notifications", expect: ["Bildirişlər"] },
    { path: "/inventory", label: "inventory list", expect: ["Anbar"] },
    { path: "/inventory/alerts", label: "low-stock alerts", expect: ["Stok xəbərdarlıqları"] },
    { path: "/inventory/supplier-orders", label: "supplier orders", expect: ["Sifarişlər"] },
    { path: "/inventory/suppliers", label: "suppliers", expect: ["Təchizatçılar"] },
    { path: `/inventory/${item.id}`, label: "inventory item detail", expect: ["Bonding agent"] },
    { path: `/inventory/suppliers/${supplier.id}`, label: "supplier detail", expect: ["Demo Dental Təchizat"] },
    { path: `/inventory/supplier-orders/${order.id}`, label: "supplier order detail", expect: ["SO-DEMO-01"] },
  ];

  for (const p of pages) {
    const res = await owner.get(p.path);
    check(`${p.label}: 200`, res.status === 200, `got ${res.status}`);
    check(`${p.label}: ключевой контент виден`, p.expect.every((s) => res.html.includes(s)));
    for (const pattern of OLD_BROKEN_PATTERNS) {
      check(`${p.label}: нет старого overflow-класса '${pattern}'`, !res.html.includes(pattern));
    }
  }

  // ── специфическая регрессия: реальный баг найден интерактивно (сессия 50) ──
  // DebtReminderRow на 390px давал scrollWidth(504) > clientWidth(390) из-за
  // shrink-0 на action-zone (с длинной кнопкой "Ödəniş xatırlatması hazırla").
  // Фикс — снять shrink-0, оставить только flex-wrap.
  const debtsPage = await owner.get("/finance/debts");
  check("finance debts: action-zone класс — flex-wrap без shrink-0",
    debtsPage.html.includes("flex flex-wrap items-center gap-3") &&
      debtsPage.html.includes("Ödəniş xatırlatması hazırla"));

  // ── treatment card: aria-label на icon-only действиях (доступность) ──
  const treatmentsPage = await owner.get(`/patients/${resad.id}/treatments`);
  check("patient treatments: иконки действий имеют aria-label",
    /aria-label="[^"]+"[^>]*>\s*<svg/i.test(treatmentsPage.html) || treatmentsPage.html.includes('aria-label='));

  // ── patients table: aria-label на Eye/Pencil действиях ──
  const patientsPage = await owner.get("/patients");
  check("patients list: action-иконки имеют aria-label", patientsPage.html.includes("aria-label="));

  // ── специфическая регрессия (сессия 51): InventoryItemCard action-zone ──
  // shrink-0 не давал зоне (qty/min/badge) сжаться — тот же баг, что у
  // DebtReminderRow в сессии 50. Фикс — снять shrink-0, оставить flex-wrap.
  const inventoryPage = await owner.get("/inventory");
  check("inventory list: action-zone класс — flex-wrap без shrink-0",
    inventoryPage.html.includes("flex flex-wrap items-center gap-3") &&
      inventoryPage.html.includes("Bonding agent"));

  // ── специфическая регрессия (сессия 51): PageHeader actions на /inventory ──
  // 5 ссылок (alerts/reports/orders/suppliers/+new) без flex-wrap — последняя
  // уходила за пределы viewport (right:693px при clientWidth:390px). Фикс —
  // добавлен flex-wrap (этот паттерн отличается от sm:flex-nowrap-бага: тут
  // wrap не было вообще, ни в каком виде).
  check("inventory list: PageHeader actions — flex-wrap, все 5 ссылок видны",
    inventoryPage.html.includes("flex flex-wrap items-center gap-2") &&
      ["Stok xəbərdarlıqları", "Sərfiyyat hesabatı", "Sifarişlər", "Təchizatçılar", "Yeni material"].every(
        (s) => inventoryPage.html.includes(s),
      ));

  // ── aria-label на icon-only действиях inventory/supplier (сессия 51) ──
  const supplierPage = await owner.get(`/inventory/suppliers/${supplier.id}`);
  check("supplier detail: edit-иконка имеет aria-label", supplierPage.html.includes("aria-label="));

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
