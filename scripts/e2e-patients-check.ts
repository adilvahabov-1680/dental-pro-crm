/**
 * E2E-проверка модуля Pasiyentlər по HTTP (dev-скрипт):
 *   npx tsx scripts/e2e-patients-check.ts
 *
 * Требует запущенный dev-сервер (npm run dev) и seed.
 * Использует progressive-enhancement форму server actions (POST без JS,
 * скрытые $ACTION-поля из SSR-HTML) + ручной cookie-jar — полный путь
 * middleware → server action → БД → redirect, без браузера.
 *
 * Проверяет:
 *  1. login owner → session cookie;
 *  2. список пациентов отображается;
 *  3. createPatient через форму → 303 на /patients/[id], данные в карточке;
 *  4. dental_chart создан автоматически (через Prisma);
 *  5. audit_log записан;
 *  6. updatePatient меняет данные;
 *  7. doctor не видит чужого пациента в списке и получает 404 по прямой ссылке;
 *  8. user без patients.manage не может POST-ить create (redirect, записи нет).
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
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || c.toLowerCase().includes("max-age=0")) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async get(path: string): Promise<{ status: number; html: string; location?: string }> {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      headers: { cookie: this.header() },
    });
    this.store(res);
    return {
      status: res.status,
      html: res.status < 300 ? await res.text() : "",
      location: res.headers.get("location") ?? undefined,
    };
  }

  /** POST формы server action: берём скрытые $ACTION-поля из SSR-HTML страницы. */
  async postForm(
    path: string,
    pageHtml: string,
    fields: Record<string, string>,
  ): Promise<{ status: number; location?: string }> {
    const fd = new FormData();
    const unescapeHtml = (s: string) =>
      s
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    // все скрытые input'ы формы ($ACTION_REF, $ACTION_ID и т.п.)
    const hidden = [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0]);
    for (const tag of hidden) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(unescapeHtml(name), unescapeHtml(value));
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

  async login(email: string): Promise<boolean> {
    const page = await this.get("/login");
    const r = await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session") && (r.status === 303 || r.status === 302);
  }
}

async function main() {
  console.log(`E2E patients check → ${BASE}\n`);
  const phone = "+994559998877";

  // очистка от прошлых прогонов
  await prisma.dentalChart.deleteMany({ where: { patient: { phone } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "patient" } });
  await prisma.patient.deleteMany({ where: { phone } });

  // 1. login owner
  const owner = new Session();
  check("login owner → session cookie", await owner.login("admin@demo.dentalpro.az"));

  // 2. список
  const list = await owner.get("/patients");
  check("список пациентов рендерится (Rəşad в HTML)", list.html.includes("Həsənov"));
  check("у владельца виден Tural (без врача)", list.html.includes("Tural"));

  // 3. создание пациента через форму
  const newPage = await owner.get("/patients/new");
  check("форма создания открывается", newPage.status === 200);
  const created = await owner.postForm("/patients/new", newPage.html, {
    lastName: "Əliyev",
    firstName: "Kamran",
    phone: "+994 55 999 88 77",
    birthDate: "1990-03-05",
    gender: "male",
    status: "active",
  });
  const loc = created.location ?? "";
  const idMatch = loc.match(/\/patients\/([0-9a-f-]{36})/);
  check("createPatient → 303 на /patients/[id]", created.status === 303 && !!idMatch, `got ${created.status} ${loc}`);
  const newId = idMatch?.[1] ?? "";

  const detail = await owner.get(`/patients/${newId}`);
  check("карточка нового пациента: имя и нормализованный телефон",
    detail.html.includes("Kamran") && detail.html.includes("+994559998877"));

  // 4. dental chart авто-создан
  const chart = await prisma.dentalChart.findFirst({ where: { patientId: newId } });
  check("dental_chart создан автоматически (adult)", chart?.chartType === "adult");

  // 5. audit log
  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "patient", entityId: newId, action: "create" },
  });
  check("audit_log: create записан", !!audit);

  // 6. редактирование
  const editPage = await owner.get(`/patients/${newId}/edit`);
  const updated = await owner.postForm(`/patients/${newId}/edit`, editPage.html, {
    id: newId,
    lastName: "Əliyev",
    firstName: "Kamran",
    phone: "+994559998877",
    birthDate: "1990-03-05",
    gender: "male",
    status: "active",
    allergies: "Lidokain",
  });
  check("updatePatient → 303", updated.status === 303, `got ${updated.status}`);
  const inDb = await prisma.patient.findUnique({ where: { id: newId } });
  check("изменения сохранены (allergies=Lidokain)", inDb?.allergies === "Lidokain");
  const auditUpd = await prisma.auditLog.findFirst({
    where: { entityType: "patient", entityId: newId, action: "update" },
  });
  check("audit_log: update записан", !!auditUpd);

  // 6b. создание ребёнка: guardian находится по телефону (Rəşad) и линкуется
  await prisma.dentalChart.deleteMany({ where: { patient: { firstName: "TestUşaq" } } });
  await prisma.patient.deleteMany({ where: { firstName: "TestUşaq" } });
  const childCreated = await owner.postForm("/patients/new", newPage.html, {
    lastName: "Həsənova",
    firstName: "TestUşaq",
    birthDate: "2020-01-01",
    gender: "female",
    status: "active",
    isChild: "on",
    guardianFullName: "Rəşad Həsənov",
    guardianPhone: "+994 50 111 22 33",
  });
  const childId = (childCreated.location ?? "").match(/\/patients\/([0-9a-f-]{36})/)?.[1] ?? "";
  const childDb = await prisma.patient.findUnique({
    where: { id: childId },
    include: { guardian: true, dentalCharts: true },
  });
  check("ребёнок создан без своего телефона", childCreated.status === 303 && !!childDb);
  check(
    "guardian найден по телефону и связан (Rəşad)",
    childDb?.guardian?.phone === "+994501112233",
  );
  check(
    "детский dental_chart (child) создан автоматически",
    childDb?.dentalCharts.some((c) => c.chartType === "child") ?? false,
  );

  // 7. doctor scope
  const doctor = new Session();
  check("login doctor", await doctor.login("hekim@demo.dentalpro.az"));
  const docList = await doctor.get("/patients");
  check("doctor видит своих (Rəşad)", docList.html.includes("Həsənov"));
  check("doctor НЕ видит Tural (не его пациент)", !docList.html.includes("Tural"));
  // Tural по прямой ссылке → 404 (в dev-streaming статус может быть 200,
  // а 404-страница — в теле; главное — данные пациента не утекают)
  const tural = await prisma.patient.findFirst({ where: { phone: "+994703334455" } });
  const notFoundBody = (html: string) =>
    !html.includes("Tural") && !html.includes("+994703334455");
  const foreign = await doctor.get(`/patients/${tural!.id}`);
  check(
    "чужой пациент по прямой ссылке → 404 / данные не утекают",
    foreign.status === 404 || notFoundBody(foreign.html),
    `status ${foreign.status}`,
  );
  const foreignEdit = await doctor.get(`/patients/${tural!.id}/edit`);
  check(
    "чужой пациент: /edit → 404 / данные не утекают",
    foreignEdit.status === 404 || notFoundBody(foreignEdit.html),
    `status ${foreignEdit.status}`,
  );

  // 8. assistant (нет patients.manage) — create недоступен
  const assistant = new Session();
  check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
  const asstNew = await assistant.get("/patients/new");
  // dev-streaming: redirect может прийти в теле — проверяем, что форма не отрендерена
  check(
    "assistant: /patients/new недоступна (нет manage)",
    asstNew.status === 307 || asstNew.status === 303 || !asstNew.html.includes('id="lastName"'),
    `status ${asstNew.status}`,
  );
  const before = await prisma.patient.count({ where: { lastName: "Hacker" } });
  await assistant.postForm("/patients/new", newPage.html, {
    lastName: "Hacker",
    firstName: "Test",
    phone: "+994000000000",
  });
  const after = await prisma.patient.count({ where: { lastName: "Hacker" } });
  check("assistant: POST create не создаёт запись", before === after && after === 0);

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
