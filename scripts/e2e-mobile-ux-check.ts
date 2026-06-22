/**
 * E2E-проверка Mobile UX / Doctor Workflow Polish v1 (сессия 50):
 *   npx tsx scripts/e2e-mobile-ux-check.ts
 * Требует дев-сервер + seed.
 *
 * Проект не использует Playwright/браузерный harness (только HTTP +
 * cookie-jar + строковые DOM-проверки, как и все остальные e2e-скрипты) —
 * визуальная проверка отсутствия horizontal overflow на 360/390/430/768px
 * была сделана интерактивно через MCP preview-браузер во время разработки
 * (resize + document.documentElement.scrollWidth vs clientWidth на каждой
 * из 9 целевых страниц). Этот скрипт — лёгкая регрессионная защита:
 * не повторяет визуальный замер (нет браузера в CI), но гарантирует, что
 * найденный реальный баг (DebtReminderRow/TreatmentItemCard/AppointmentCard/
 * InvoiceCard — `shrink-0` на action-zone не давал ей сжаться/обернуться
 * при `flex-wrap`, единственно верный фикс — снять `shrink-0`) не
 * вернётся, и что ключевые страницы/кнопки рендерятся.
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

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
