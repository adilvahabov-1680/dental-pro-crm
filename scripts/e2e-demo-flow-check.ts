/**
 * E2E demo-flow smoke check (сессия 18, dev-скрипт):
 *   npx tsx scripts/e2e-demo-flow-check.ts
 * Требует dev-сервер + seed. Не дублирует модульные e2e-наборы — быстрая
 * проверка, что демо-путь (DEMO.md) не сломан перед показом клинике:
 * логины ролей, ключевые страницы открываются, базовые ограничения доступа
 * работают.
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

  // 9. doctor cannot access admin
  const doctor = new Session();
  await doctor.login("hekim@demo.dentalpro.az");
  const doctorAdmin = await doctor.get("/admin");
  check("9. doctor: /admin əlçatan deyil (redirect)", doctorAdmin.status >= 300);

  // 10. assistant cannot access restricted area (Ayarlar — нет settings.view)
  const assistant = new Session();
  await assistant.login("assistent@demo.dentalpro.az");
  const assistantSettings = await assistant.get("/settings");
  check("10. assistant: /settings əlçatan deyil (redirect)", assistantSettings.status >= 300);

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
