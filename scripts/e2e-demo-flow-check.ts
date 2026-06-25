/**
 * E2E demo-flow smoke check (сессия 18, расширен в сессии 52, dev-скрипт):
 *   npx tsx scripts/e2e-demo-flow-check.ts
 * Требует dev-сервер + seed. Не дублирует модульные e2e-наборы — быстрая
 * проверка, что демо-путь (DEMO.md / DEMO_PRESENTATION.md) не сломан перед
 * показом клинике: логины ролей, ключевые страницы всех модулей открываются,
 * базовые ограничения доступа работают, /login demo-hint не утекает реальный
 * dev-пароль.
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, html: res.status < 300 ? await res.text() : "" };
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, text: await res.text() };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

async function main() {
  console.log(`E2E demo-flow check → ${BASE}\n`);

  const resad = await prisma.patient.findFirstOrThrow({ where: { firstName: "Rəşad", lastName: "Həsənov" } });
  const invoice = await prisma.invoice.findFirst({ where: { patientId: resad.id } });

  // 1. owner login
  const owner = new Session();
  check("1. owner login işləyir", await owner.login("admin@demo.dentalpro.az"));

  // 2. dashboard opens
  const dashboard = await owner.get("/dashboard");
  check("2. dashboard açılır", dashboard.status === 200 && dashboard.html.includes("Dashboard"));

  // 3. global search finds demo patient
  const search = await owner.get(`/api/search?q=${encodeURIComponent("Rəşad")}`);
  check("3. global search Rəşad-ı tapır", search.status === 200 && search.html.includes("Həsənov"));

  // 4. patient page opens
  const patientPage = await owner.get(`/patients/${resad.id}`);
  check("4. pasiyent kartı açılır", patientPage.status === 200 && patientPage.html.includes("Həsənov"));

  // 5. patient documents block visible
  check("5. Sənədlər bloku kartda görünür", patientPage.html.includes("Sənədlər"));

  // 6. invoice page opens
  if (invoice) {
    const invoicePage = await owner.get(`/finance/invoices/${invoice.id}`);
    check("6. hesab səhifəsi açılır", invoicePage.status === 200 && invoicePage.html.includes("INV-"));
  } else {
    check("6. hesab səhifəsi açılır", false, "(no seed invoice found for Rəşad)");
  }

  // 7. settings opens
  const settings = await owner.get("/settings");
  check("7. Ayarlar açılır", settings.status === 200 && settings.html.includes("İş saatları"));

  // 8. admin opens
  const admin = await owner.get("/admin");
  check("8. Admin açılır", admin.status === 200 && admin.html.includes("Əməkdaşlar və rollar"));

  // 9-15. demo-presentation üçün açılması vacib olan əsas modullar (сессия 52)
  const keyPages: Array<[string, string, string]> = [
    ["9", "/patients", "Pasiyentlər"],
    ["10", "/appointments", "Qəbullar"],
    ["11", "/finance", "Maliyyə"],
    ["12", "/inventory", "Anbar"],
    ["13", "/recalls", "Kontrol xatırlatmaları"],
    ["14", "/feedback", "Pasiyent rəyləri"],
    ["15", "/notifications", "Bildirişlər"],
  ];
  for (const [n, path, marker] of keyPages) {
    const page = await owner.get(path);
    check(`${n}. ${path} açılır`, page.status === 200 && page.html.includes(marker));
  }

  // 16. doctor cannot access admin
  const doctor = new Session();
  await doctor.login("hekim@demo.dentalpro.az");
  const doctorAdmin = await doctor.get("/admin");
  check("16. doctor: /admin əlçatan deyil (redirect)", doctorAdmin.status >= 300);

  // 17. assistant cannot access restricted area (Ayarlar — нет settings.view)
  const assistant = new Session();
  await assistant.login("assistent@demo.dentalpro.az");
  const assistantSettings = await assistant.get("/settings");
  check("17. assistant: /settings əlçatan deyil (redirect)", assistantSettings.status >= 300);

  // 18. health check открыт без авторизации (сессия 20)
  const health = await fetch(BASE + "/api/health");
  const healthBody = await health.json().catch(() => null);
  check("18. /api/health işləyir (ok:true, авторизация tələb olunmur)", health.status === 200 && healthBody?.ok === true);

  // 19. /login demo-hint daxili uyğunluğu (сессия 52): real dev-parol heç vaxt
  // səhifəyə sızmamalıdır; əgər NEXT_PUBLIC_DEMO_MODE=true isə, hint admin/admin123
  // göstərməlidir — server hansı env-də render olunursa, ona uyğun yoxlanılır.
  const loginRes = await fetch(BASE + "/login");
  const loginHtml = await loginRes.text();
  const noRealPasswordLeak = !loginHtml.includes("Demo1234");
  const hasDemoHint = loginHtml.includes("Demo giriş");
  const hintConsistent = !hasDemoHint || (loginHtml.includes("admin123") && loginHtml.includes(">admin<"));
  check(
    "19. /login: demo-hint düzgündür, real parol sızmır",
    noRealPasswordLeak && hintConsistent,
    `hasDemoHint=${hasDemoHint}`,
  );

  // 20-21. Doctor Daily Report bugün boş görünməməlidir (сессия 73: seed
  // "fresh" demo-müalicəsini hər seed-də bugünə köçürür, ona görə свежий
  // seed-də /reports/daily-doctor "сегодня" həmişə real məzmun göstərməlidir).
  // Empty-state mətni dict-bloku kimi həmişə bir dəfə HTML-də olur (RSC),
  // ona görə "yoxdur" deyil, real sətir markerinin OLMASI yoxlanılır.
  const ownerDaily = await owner.get("/reports/daily-doctor");
  check(
    "20. owner: bugünkü Gündəlik hesabat boş deyil",
    ownerDaily.status === 200 &&
      ownerDaily.html.includes("Profilaktik təmizlik") &&
      /daily-report-row-[a-f0-9-]+/.test(ownerDaily.html),
  );
  const doctorDaily = await doctor.get("/reports/daily-doctor");
  check(
    "21. doctor: öz bugünkü hesabatında da məzmun var",
    doctorDaily.status === 200 &&
      doctorDaily.html.includes("Profilaktik təmizlik") &&
      /daily-report-row-[a-f0-9-]+/.test(doctorDaily.html),
  );

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
