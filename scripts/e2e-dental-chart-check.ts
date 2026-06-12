/**
 * E2E-проверка модуля Diş xəritəsi (dev-скрипт):
 *   npx tsx scripts/e2e-dental-chart-check.ts
 * Требует запущенный dev-сервер + seed. Та же техника, что e2e-patients-check:
 * HTTP + cookie-jar + progressive-enhancement формы server actions.
 *
 * Проверяет: рендер карты, ensureToothRecords (32 adult / 20 child),
 * обновление зуба + tooth_history (append-only) + audit, no-op без истории,
 * read-only для assistant (нет manage), запрет POST без manage,
 * недоступность чужой карты для врача, child chart не падает.
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
    const unescapeHtml = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
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
    return { status: res.status };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

async function main() {
  console.log(`E2E dental chart check → ${BASE}\n`);

  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });
  const aysu = await prisma.patient.findFirstOrThrow({
    where: { firstName: "Aysu", lastName: "Həsənova" },
  });

  // сброс тестового зуба 16 к seed-состоянию (идемпотентность повторных прогонов;
  // app-уровень историю не трогает — это reset тестовых данных через prisma)
  const seedChart = await prisma.dentalChart.findFirst({
    where: { patientId: resad.id, chartType: "adult" },
  });
  if (seedChart) {
    const seedRec16 = await prisma.toothRecord.findFirst({
      where: { dentalChartId: seedChart.id, toothNumber: 16 },
    });
    if (seedRec16) {
      await prisma.toothHistory.deleteMany({ where: { toothRecordId: seedRec16.id } });
      await prisma.toothRecord.update({
        where: { id: seedRec16.id },
        data: {
          status: "needs_treatment",
          priority: "normal",
          diagnosis: "Dərin kariyes",
          doctorNotes: null,
          lastTreatedAt: null,
        },
      });
    }
  }

  // 1. owner открывает карту Rəşad'а
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const chartPage = await owner.get(`/patients/${resad.id}/dental-chart`);
  check("карта рендерится (Üst çənə + Alt çənə)",
    chartPage.html.includes("Üst çənə") && chartPage.html.includes("Alt çənə"));
  check("зубы 18 и 28 в разметке",
    chartPage.html.includes(">18<") && chartPage.html.includes(">28<"));
  check("легенда статусов есть", chartPage.html.includes("Kanal müalicəsi"));

  // 2. ensureToothRecords: после открытия — все 32 записи
  const adultChart = await prisma.dentalChart.findFirstOrThrow({
    where: { patientId: resad.id, chartType: "adult" },
  });
  const count32 = await prisma.toothRecord.count({ where: { dentalChartId: adultChart.id } });
  check("ensureToothRecords: 32 взрослых зуба", count32 === 32, `got ${count32}`);

  // 3. карточка зуба 16 (?tooth=16) + обновление статуса
  const toothPage = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
  check("карточка зуба 16 открывается (форма update)",
    toothPage.html.includes('name="status"') && toothPage.html.includes("Dərin kariyes"));

  const rec16 = await prisma.toothRecord.findFirstOrThrow({
    where: { dentalChartId: adultChart.id, toothNumber: 16 },
  });
  const historyBefore = await prisma.toothHistory.count({ where: { toothRecordId: rec16.id } });

  await owner.postForm(`/patients/${resad.id}/dental-chart?tooth=16`, toothPage.html, {
    toothRecordId: rec16.id,
    patientId: resad.id,
    status: "in_treatment",
    priority: "high",
    diagnosis: "Dərin kariyes",
    doctorNotes: "Müalicəyə başlandı",
    procedureDone: "Anesteziya + kariyes təmizləndi",
  });

  const rec16After = await prisma.toothRecord.findUniqueOrThrow({ where: { id: rec16.id } });
  check("статус зуба обновился (in_treatment)", rec16After.status === "in_treatment");
  check("priority обновился (high)", rec16After.priority === "high");
  check("lastTreatedAt установлен", rec16After.lastTreatedAt !== null);

  const historyAfter = await prisma.toothHistory.findMany({
    where: { toothRecordId: rec16.id },
    orderBy: { createdAt: "desc" },
  });
  check("tooth_history: запись добавлена", historyAfter.length === historyBefore + 1);
  check(
    "tooth_history: previous→new корректны",
    historyAfter[0]?.previousStatus === "needs_treatment" &&
      historyAfter[0]?.newStatus === "in_treatment" &&
      historyAfter[0]?.procedureDone === "Anesteziya + kariyes təmizləndi",
  );
  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "tooth_record", entityId: rec16.id, action: "update" },
  });
  check("audit_log: tooth update записан", !!audit);

  // 4. no-op сохранение не плодит историю
  const toothPage2 = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
  await owner.postForm(`/patients/${resad.id}/dental-chart?tooth=16`, toothPage2.html, {
    toothRecordId: rec16.id,
    patientId: resad.id,
    status: "in_treatment",
    priority: "high",
    diagnosis: "Dərin kariyes",
    doctorNotes: "Müalicəyə başlandı",
    procedureDone: "",
  });
  const historyNoop = await prisma.toothHistory.count({ where: { toothRecordId: rec16.id } });
  check("no-op сохранение не создаёт историю", historyNoop === historyAfter.length);

  // 5. история отображается в карточке
  const toothPage3 = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
  check("история видна в slide-over", toothPage3.html.includes("Anesteziya"));

  // 6. doctor: чужая карта (Tural) недоступна, данные не утекают
  const doctor = new Session();
  check("login doctor", await doctor.login("hekim@demo.dentalpro.az"));
  const own = await doctor.get(`/patients/${resad.id}/dental-chart`);
  check("doctor открывает карту своего пациента", own.html.includes("Üst çənə"));
  const foreign = await doctor.get(`/patients/${tural.id}/dental-chart`);
  check(
    "doctor: чужая карта → 404 / нет утечки",
    foreign.status === 404 || (!foreign.html.includes("Tural") && !foreign.html.includes("Üst çənə")),
    `status ${foreign.status}`,
  );

  // 7. assistant: read-only (нет dental_chart.manage)
  const assistant = new Session();
  check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
  const asstView = await assistant.get(`/patients/${resad.id}/dental-chart?tooth=16`);
  check("assistant видит карту пациента своего врача", asstView.html.includes("Üst çənə"));
  check("assistant: формы update нет (read-only)", !asstView.html.includes('name="status"'));
  // POST с чужими $ACTION-полями — изменение не проходит
  await assistant.postForm(`/patients/${resad.id}/dental-chart?tooth=16`, toothPage3.html, {
    toothRecordId: rec16.id,
    patientId: resad.id,
    status: "extracted",
    priority: "low",
    diagnosis: "",
    doctorNotes: "",
    procedureDone: "hack",
  });
  const rec16Final = await prisma.toothRecord.findUniqueOrThrow({ where: { id: rec16.id } });
  check("assistant: POST update не меняет зуб", rec16Final.status === "in_treatment");

  // 8. child chart (Aysu) — не падает, 20 молочных зубов
  const childPage = await owner.get(`/patients/${aysu.id}/dental-chart`);
  check("child chart рендерится", childPage.status === 200 && childPage.html.includes(">55<"));
  const childChart = await prisma.dentalChart.findFirst({
    where: { patientId: aysu.id, chartType: "child" },
  });
  const childCount = childChart
    ? await prisma.toothRecord.count({ where: { dentalChartId: childChart.id } })
    : 0;
  check("child chart: 20 молочных зубов", childCount === 20, `got ${childCount}`);

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
