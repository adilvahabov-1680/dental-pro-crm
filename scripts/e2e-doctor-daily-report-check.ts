/**
 * E2E-проверка Doctor Daily Report (Session 70):
 *   npx tsx scripts/e2e-doctor-daily-report-check.ts
 * Требует dev-сервер + seed (demo-klinika). Техника: HTTP + cookie-jar
 * (как другие e2e-скрипты модуля). Тестовые записи — маркер "E2E-DailyReport".
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
  async login(email: string) {
    const page = await fetch(BASE + "/login");
    this.store(page);
    const html = await page.text();
    const fd = new FormData();
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    for (const tag of [...html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    fd.set("email", email);
    fd.set("password", PASSWORD);
    const res = await fetch(BASE + "/login", {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), origin: BASE },
      body: fd,
    });
    this.store(res);
    return this.cookies.has("dp_session");
  }
}

function fmtMoney(gapik: number): string {
  return `${(gapik / 100).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  console.log(`E2E doctor daily report check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const ownerUser = await prisma.user.findFirstOrThrow({
    where: { clinicId: clinic.id, role: { key: "owner" } },
  });
  const doctorA = await prisma.doctor.findFirstOrThrow({
    where: { clinicId: clinic.id },
    include: { user: true },
  });
  const patient = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { key: "doctor" } });

  // ── cleanup от прошлых прогонов ────────────────────────────────────────────
  const oldItems = await prisma.treatmentItem.findMany({ where: { notes: { startsWith: "e2e-daily-report" } } });
  for (const it of oldItems) {
    await prisma.treatmentConsumableUsage.deleteMany({ where: { treatmentItemId: it.id } });
    await prisma.invoiceItem.deleteMany({ where: { treatmentItemId: it.id } });
  }
  await prisma.payment.deleteMany({ where: { notes: "e2e-daily-report" } });
  await prisma.invoice.deleteMany({ where: { notes: "e2e-daily-report" } });
  await prisma.treatmentItem.deleteMany({ where: { notes: { startsWith: "e2e-daily-report" } } });
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItem: { name: "E2E-DailyReport-Material" } },
  });
  await prisma.inventoryItem.deleteMany({ where: { name: "E2E-DailyReport-Material", clinicId: clinic.id } });
  await prisma.service.deleteMany({ where: { name: "E2E-DailyReport-Svc", clinicId: clinic.id } });
  const oldDoctorBUser = await prisma.user.findFirst({ where: { email: "e2e-daily-report-doctorb@example.test" } });
  if (oldDoctorBUser) {
    await prisma.doctor.deleteMany({ where: { userId: oldDoctorBUser.id } });
    await prisma.user.delete({ where: { id: oldDoctorBUser.id } });
  }

  // ── Setup ────────────────────────────────────────────────────────────────────
  console.log("Setup — creating test data…");

  const svc = await prisma.service.create({
    data: { clinicId: clinic.id, name: "E2E-DailyReport-Svc", isActive: true },
  });

  const item = await prisma.inventoryItem.create({
    data: { clinicId: clinic.id, name: "E2E-DailyReport-Material", unit: "ədəd", quantity: 100, minQuantity: 0, unitCost: 500 },
  });
  await prisma.inventoryMovement.create({
    data: { clinicId: clinic.id, inventoryItemId: item.id, type: "in_stock", quantity: 100, reason: "E2E initial", performedById: ownerUser.id },
  });

  const doctorBUser = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: doctorRole.id,
      email: "e2e-daily-report-doctorb@example.test",
      passwordHash: "e2e-unused-not-a-real-hash",
      fullName: "E2E Doctor B",
    },
  });
  const doctorB = await prisma.doctor.create({ data: { clinicId: clinic.id, userId: doctorBUser.id } });

  const now = new Date();

  // doctorA: 2 done-процедуры сегодня, один пациент (patientsCount=1, treatmentsCount=2)
  const item1 = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id, patientId: patient.id, doctorId: doctorA.id, serviceId: svc.id,
      status: "done", price: 10000, discount: 1000, performedAt: now, notes: "e2e-daily-report-1",
    },
  });
  const item2 = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id, patientId: patient.id, doctorId: doctorA.id, serviceId: svc.id,
      status: "done", price: 5000, discount: 0, performedAt: now, notes: "e2e-daily-report-2",
    },
  });

  // override-расход на item1: 3 ədəd (фактическое применение, не шаблонное значение)
  await prisma.treatmentConsumableUsage.create({
    data: {
      clinicId: clinic.id, treatmentItemId: item1.id, inventoryItemId: item.id,
      quantity: 3, unit: "ədəd", baseQuantity: 3, baseUnit: "ədəd",
      wasSkipped: false, isReversed: false, createdById: ownerUser.id,
    },
  });

  // счёт + оплата на item1 (item2 остаётся без счёта — проверка "не выставлен")
  const maxNum = await prisma.invoice.aggregate({ where: { clinicId: clinic.id }, _max: { number: true } });
  const invoice = await prisma.invoice.create({
    data: {
      clinicId: clinic.id, patientId: patient.id, doctorId: doctorA.id,
      number: (maxNum._max.number ?? 0) + 1, status: "paid",
      subtotal: 9000, discount: 0, total: 9000, paidAmount: 9000,
      notes: "e2e-daily-report",
    },
  });
  await prisma.invoiceItem.create({
    data: { clinicId: clinic.id, invoiceId: invoice.id, treatmentItemId: item1.id, description: "E2E", qty: 1, unitPrice: 9000, total: 9000 },
  });
  await prisma.treatmentItem.update({ where: { id: item1.id }, data: { invoiceId: invoice.id } });
  await prisma.payment.create({
    data: { clinicId: clinic.id, patientId: patient.id, invoiceId: invoice.id, amount: 9000, method: "cash", paidAt: now, receivedById: ownerUser.id, notes: "e2e-daily-report" },
  });

  // doctorB: отдельная done-процедура сегодня (для проверки изоляции по врачу)
  const itemB = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id, patientId: patient.id, doctorId: doctorB.id, serviceId: svc.id,
      status: "done", price: 20000, discount: 0, performedAt: now, notes: "e2e-daily-report-b",
    },
  });

  const today = localToday();

  // ── A. Owner: clinic-wide (без фильтра по врачу) ────────────────────────────
  console.log("\nA. Owner — clinic-wide view");
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const ownerPage = await owner.get(`/reports/daily-doctor?date=${today}`);
  check("owner: страница открывается (200)", ownerPage.status === 200);
  check("owner: doctorA процедуры видны", ownerPage.html.includes("E2E-DailyReport-Svc"));
  check("owner: charged amount item1 (90,00 ₼)", ownerPage.html.includes(fmtMoney(9000)));
  check("owner: charged amount item2 (50,00 ₼)", ownerPage.html.includes(fmtMoney(5000)));
  check("owner: doctorB процедура тоже видна (без фильтра)", ownerPage.html.includes(fmtMoney(20000)));
  check("owner: override-расход показан как факт (3 ədəd), не шаблон", /3\s*(?:<!--\s*-->\s*)?ədəd/.test(ownerPage.html));
  check("owner: материал в разделе Materiallar", ownerPage.html.includes("E2E-DailyReport-Material"));
  check("owner: себестоимость расходника (15,00 ₼ = 3×5)", ownerPage.html.includes(fmtMoney(1500)));
  check("owner: invoice status paid → 'Ödənilib' для item1", ownerPage.html.includes("Ödənilib"));
  check("owner: item2 без счёта → 'Hesablanmayıb'", ownerPage.html.includes("Hesablanmayıb"));
  check("owner: payments карточка показана (clinic-wide, без фильтра врача)", ownerPage.html.includes(fmtMoney(9000)) && ownerPage.html.includes("Bu gün ödənişlər"));
  check("owner: doctor-фильтр доступен в форме", ownerPage.html.includes('name="doctor"'));

  // ── B. Owner: фильтр по конкретному врачу (doctorA) ─────────────────────────
  console.log("\nB. Owner — filtered by doctorA");
  const ownerFiltered = await owner.get(`/reports/daily-doctor?date=${today}&doctor=${doctorA.id}`);
  check("owner+filter: doctorA процедуры видны", ownerFiltered.html.includes(fmtMoney(9000)));
  check("owner+filter: doctorB процедура НЕ видна", !ownerFiltered.html.includes(fmtMoney(20000)));
  check("owner+filter: payments карточка скрыта (нельзя атрибутировать врачу)", !ownerFiltered.html.includes("Bu gün ödənişlər"));
  check("owner+filter: profit карточка всё ещё показана", ownerFiltered.html.includes("Təxmini mənfəət"));

  // ── C. Doctor: видит только свои данные, игнорирует ?doctor= ────────────────
  console.log("\nC. Doctor — own data only, ignores ?doctor=");
  const docSession = new Session();
  check("login doctorA", await docSession.login(doctorA.user.email));
  const docPage = await docSession.get(`/reports/daily-doctor?date=${today}`);
  check("doctorA: свои процедуры видны", docPage.html.includes(fmtMoney(9000)) && docPage.html.includes(fmtMoney(5000)));
  check("doctorA: doctorB процедура НЕ видна", !docPage.html.includes(fmtMoney(20000)));
  check("doctorA: doctor-фильтр НЕ показан в форме", !docPage.html.includes('name="doctor"'));

  const docTryOther = await docSession.get(`/reports/daily-doctor?date=${today}&doctor=${doctorB.id}`);
  check(
    "doctorA: подмена ?doctor=doctorB игнорируется (видит свои, не doctorB)",
    docTryOther.html.includes(fmtMoney(9000)) && !docTryOther.html.includes(fmtMoney(20000)),
  );

  // ── D. Assistant без назначенного врача ──────────────────────────────────────
  console.log("\nD. Assistant without assigned doctor");
  const asst = new Session();
  check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
  const asstUser = await prisma.user.findFirstOrThrow({ where: { email: "assistent@demo.dentalpro.az" } });
  const asstProfile = await prisma.assistant.findFirst({ where: { userId: asstUser.id } });
  const asstPage = await asst.get(`/reports/daily-doctor?date=${today}`);
  if (asstProfile?.assignedDoctorId) {
    check("assistant: страница открывается (200), есть назначенный врач", asstPage.status === 200);
  } else {
    check("assistant: пустой экран без назначенного врача", asstPage.status === 200 && asstPage.html.includes("Sizə həkim təyin olunmayıb"));
  }

  // ── E. Reception блокирован (нет treatments.view) ───────────────────────────
  console.log("\nE. Reception blocked");
  const reception = new Session();
  const hasReception = await reception.login("resepsiya@demo.dentalpro.az");
  if (hasReception) {
    const recPage = await reception.get(`/reports/daily-doctor?date=${today}`);
    check("reception: нет доступа (redirect, не 200)", recPage.status !== 200, `got ${recPage.status}`);
  } else {
    console.log("  ~ (нет demo-аккаунта reception — пропуск)");
  }

  // ── F. Дата без процедур — пустой день ───────────────────────────────────────
  console.log("\nF. Empty day");
  const emptyPage = await owner.get(`/reports/daily-doctor?date=2020-01-01`);
  check("пустой день: страница открывается", emptyPage.status === 200);
  check("пустой день: empty-состояние показано", emptyPage.html.includes("Seçilmiş gün üçün tamamlanmış prosedur yoxdur"));
  check("пустой день: данные о наших тестовых процедурах не видны", !emptyPage.html.includes("E2E-DailyReport-Svc"));

  // ── cleanup ──────────────────────────────────────────────────────────────────
  await prisma.treatmentConsumableUsage.deleteMany({ where: { treatmentItemId: { in: [item1.id, item2.id, itemB.id] } } });
  await prisma.invoiceItem.deleteMany({ where: { treatmentItemId: item1.id } });
  await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await prisma.treatmentItem.deleteMany({ where: { id: { in: [item1.id, item2.id, itemB.id] } } });
  await prisma.inventoryMovement.deleteMany({ where: { inventoryItemId: item.id } });
  await prisma.inventoryItem.delete({ where: { id: item.id } });
  await prisma.doctor.delete({ where: { id: doctorB.id } });
  await prisma.user.delete({ where: { id: doctorBUser.id } });
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
