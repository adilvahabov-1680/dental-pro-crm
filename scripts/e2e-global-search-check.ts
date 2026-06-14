/**
 * E2E-проверка Global Search v1 (сессия 16, dev-скрипт):
 *   npx tsx scripts/e2e-global-search-check.ts
 * Требует dev-сервер + seed. Проверяет: /api/search (patients/appointments/
 * invoices/documents), tenant/scope isolation, permissions (*.view), min
 * length, исключение удалённых документов, topbar (поле больше не disabled).
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

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
interface GlobalSearchResult {
  patients: SearchResultItem[];
  appointments: SearchResultItem[];
  invoices: SearchResultItem[];
  documents: SearchResultItem[];
  services: SearchResultItem[];
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
  async getJson(path: string): Promise<{ status: number; data: GlobalSearchResult | null }> {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    const data = res.status === 200 ? ((await res.json()) as GlobalSearchResult) : null;
    return { status: res.status, data };
  }
  async postForm(path: string, pageHtml: string, fields: Record<string, string | string[]>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) for (const item of v) fd.append(k, item);
      else fd.set(k, v);
    }
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

function q(query: string) {
  return `/api/search?q=${encodeURIComponent(query)}`;
}

async function main() {
  console.log(`E2E global search check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994703334455" } });
  const seedInvoice = await prisma.invoice.findFirstOrThrow({
    where: { clinicId: clinic.id, notes: "demo-seed-invoice" },
  });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // чужая клиника + пациент (cross-tenant)
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-search-clinic-b" },
    update: {},
    create: { name: "E2E Search B", slug: "e2e-search-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Zzforeign", lastName: "E2ESearchB", phone: "+994501239988" },
  });

  // временный загруженный документ для Rəşad (поиск по title + soft-delete)
  const searchDoc = await prisma.document.create({
    data: {
      clinicId: clinic.id,
      patientId: resad.id,
      type: "other",
      title: "E2E-Search-Doc-Marker",
      fileUrl: "documents/e2e-search/marker.txt",
      mimeType: "text/plain",
      fileSize: 10,
      uploadedById: adminUser.id,
    },
  });

  try {
    // ── 1. Login owner ──────────────────────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // ── 2. Patient name search ────────────────────────────────────────
    const byName = await owner.getJson(q("Həsənov"));
    check("status 200 (name search)", byName.status === 200);
    check(
      "patient name search: Rəşad Həsənov найден",
      !!byName.data?.patients.some((p) => p.id === resad.id && p.href === `/patients/${resad.id}`),
    );

    // ── 3. Phone fragment search ───────────────────────────────────────
    const byPhone = await owner.getJson(q("501112233"));
    check(
      "phone fragment search: Rəşad найден",
      !!byPhone.data?.patients.some((p) => p.id === resad.id),
    );

    // ── 4. Doctor cross-scope isolation ─────────────────────────────────
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    const turalAsHekim = await hekim.getJson(q("Məmmədov"));
    check(
      "doctor scope: Tural (без врача) не виден врачу",
      !!turalAsHekim.data && !turalAsHekim.data.patients.some((p) => p.id === tural.id),
    );
    const turalAsOwner = await owner.getJson(q("Məmmədov"));
    check(
      "owner: Tural виден (полный доступ)",
      !!turalAsOwner.data?.patients.some((p) => p.id === tural.id),
    );

    // ── 5. Invoice number search (finance user) ─────────────────────────
    const invoiceDigits = `INV-${String(seedInvoice.number).padStart(6, "0")}`;
    const invByOwner = await owner.getJson(q(invoiceDigits));
    check(
      "invoice number search: seed-счёт найден (owner)",
      !!invByOwner.data?.invoices.some((i) => i.id === seedInvoice.id && i.href === `/finance/invoices/${seedInvoice.id}`),
    );

    // ── 6. Invoice hidden for non-finance user ───────────────────────────
    const assistant = new Session();
    check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
    const invByAssistant = await assistant.getJson(q(invoiceDigits));
    check(
      "invoice search: скрыт для assistant (нет finance.view)",
      !!invByAssistant.data && invByAssistant.data.invoices.length === 0,
    );

    // ── 7. Uploaded document title search ───────────────────────────────
    const docByOwner = await owner.getJson(q("E2E-Search-Doc-Marker"));
    check(
      "document title search: найден загруженный документ",
      !!docByOwner.data?.documents.some(
        (d) => d.id === searchDoc.id && d.href === `/patients/${resad.id}/documents`,
      ),
    );

    // ── 8. Deleted document exclusion ───────────────────────────────────
    await prisma.document.update({ where: { id: searchDoc.id }, data: { deletedAt: new Date() } });
    const docAfterDelete = await owner.getJson(q("E2E-Search-Doc-Marker"));
    check(
      "document title search: удалённый документ скрыт",
      !!docAfterDelete.data && !docAfterDelete.data.documents.some((d) => d.id === searchDoc.id),
    );

    // ── 9. Cross-tenant isolation ────────────────────────────────────────
    const crossTenant = await owner.getJson(q("Zzforeign"));
    check(
      "cross-tenant: пациент другой клиники не найден",
      !!crossTenant.data && crossTenant.data.patients.length === 0,
    );

    // ── 10. Empty / min-length safe response ─────────────────────────────
    const tooShort = await owner.getJson(q("a"));
    check(
      "min length: запрос короче 2 символов → все группы пусты",
      tooShort.status === 200 &&
        !!tooShort.data &&
        Object.values(tooShort.data).every((arr) => Array.isArray(arr) && arr.length === 0),
    );
    const empty = await owner.getJson(q(""));
    check(
      "empty query → все группы пусты",
      empty.status === 200 &&
        !!empty.data &&
        Object.values(empty.data).every((arr) => Array.isArray(arr) && arr.length === 0),
    );

    // ── 11. Topbar: поиск больше не disabled ──────────────────────────────
    const dashboard = await owner.get("/dashboard");
    check(
      "topbar: поле поиска присутствует и не disabled",
      dashboard.html.includes("Axtarış") && !/placeholder="Axtarış[^"]*"[^>]*disabled/.test(dashboard.html),
    );
    check("topbar: атрибут disabled у поиска отсутствует", !/disabled[^>]*placeholder="Axtarış/.test(dashboard.html));

    // ── 12. Регрессия: существующие страницы открываются ──────────────────
    check("/patients открывается", (await owner.get("/patients")).status === 200);
    check("/appointments открывается", (await owner.get("/appointments")).status === 200);
    check("/finance открывается", (await owner.get("/finance")).status === 200);
    check("/documents открывается", (await owner.get("/documents")).status === 200);
    check("/notifications открывается", (await owner.get("/notifications")).status === 200);
  } finally {
    await prisma.document.delete({ where: { id: searchDoc.id } }).catch(() => {});
    await prisma.patient.delete({ where: { id: patientB.id } }).catch(() => {});
    await prisma.clinic.delete({ where: { id: clinicB.id } }).catch(() => {});
    console.log("\n  (временные данные e2e удалены)");
  }

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
