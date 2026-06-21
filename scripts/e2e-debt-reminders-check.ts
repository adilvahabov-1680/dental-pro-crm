/**
 * E2E-проверка Debt Reminder / Payment Communication v1 (сессия 47):
 *   npx tsx scripts/e2e-debt-reminders-check.ts
 * Требует dev-сервер + seed. Создаёт собственные пациенты/счета/долги и
 * удаляет их в finally — не зависит от demo-seed дат.
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

/** Числовая часть formatMoney (без суффикса валюты) — как в остальных e2e. */
function fmtNum(qepik: number): string {
  return (qepik / 100).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function forms(html: string): string[] {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

function formContaining(html: string, ...needles: string[]): string {
  return forms(html).find((f) => needles.every((n) => f.includes(n))) ?? "";
}

async function main() {
  console.log(`E2E debt reminders check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // сброс прошлых прогонов
  const oldInvoices = await prisma.invoice.findMany({ where: { notes: "e2e-debt-reminders" } });
  for (const inv of oldInvoices) {
    await prisma.notification.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.debt.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.invoice.delete({ where: { id: inv.id } });
  }
  await prisma.patient.deleteMany({ where: { clinicId: clinic.id, lastName: "E2E47" } });

  const cleanupNotificationIds: string[] = [];

  // ── Тестовые пациенты (своя клиника) ──────────────────────────────
  const patientOpen = await prisma.patient.create({
    data: { clinicId: clinic.id, firstName: "DebtOpen", lastName: "E2E47", phone: "+994501230001" },
  });
  const patientPartial = await prisma.patient.create({
    data: { clinicId: clinic.id, firstName: "DebtPartial", lastName: "E2E47", phone: "+994501230002" },
  });
  const patientPaid = await prisma.patient.create({
    data: { clinicId: clinic.id, firstName: "DebtPaid", lastName: "E2E47", phone: "+994501230003" },
  });
  const patientNoPhone = await prisma.patient.create({
    data: { clinicId: clinic.id, firstName: "DebtNoPhone", lastName: "E2E47", phone: null },
  });

  // ── A. unpaid invoice ───────────────────────────────────────────────
  const invoiceOpen = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patientOpen.id,
      number: 999601,
      status: "issued",
      subtotal: 100_00,
      total: 100_00,
      paidAmount: 0,
      notes: "e2e-debt-reminders",
    },
  });
  const debtOpen = await prisma.debt.create({
    data: { clinicId: clinic.id, patientId: patientOpen.id, invoiceId: invoiceOpen.id, amount: 100_00, status: "open" },
  });

  // ── B. partially paid invoice ───────────────────────────────────────
  const invoicePartial = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patientPartial.id,
      number: 999602,
      status: "partially_paid",
      subtotal: 80_00,
      total: 80_00,
      paidAmount: 30_00,
      notes: "e2e-debt-reminders",
    },
  });
  await prisma.payment.create({
    data: {
      clinicId: clinic.id,
      patientId: patientPartial.id,
      invoiceId: invoicePartial.id,
      amount: 30_00,
      method: "cash",
      paidAt: new Date(),
      receivedById: adminUser.id,
    },
  });
  const debtPartial = await prisma.debt.create({
    data: { clinicId: clinic.id, patientId: patientPartial.id, invoiceId: invoicePartial.id, amount: 50_00, status: "partial" },
  });

  // ── C. fully paid invoice ────────────────────────────────────────────
  const invoicePaid = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patientPaid.id,
      number: 999603,
      status: "paid",
      subtotal: 60_00,
      total: 60_00,
      paidAmount: 60_00,
      notes: "e2e-debt-reminders",
    },
  });
  await prisma.payment.create({
    data: {
      clinicId: clinic.id,
      patientId: patientPaid.id,
      invoiceId: invoicePaid.id,
      amount: 60_00,
      method: "card",
      paidAt: new Date(),
      receivedById: adminUser.id,
    },
  });
  const debtPaid = await prisma.debt.create({
    data: { clinicId: clinic.id, patientId: patientPaid.id, invoiceId: invoicePaid.id, amount: 0, status: "closed" },
  });

  // ── E. unpaid invoice, no phone ──────────────────────────────────────
  const invoiceNoPhone = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patientNoPhone.id,
      number: 999604,
      status: "issued",
      subtotal: 40_00,
      total: 40_00,
      paidAmount: 0,
      notes: "e2e-debt-reminders",
    },
  });
  const debtNoPhone = await prisma.debt.create({
    data: { clinicId: clinic.id, patientId: patientNoPhone.id, invoiceId: invoiceNoPhone.id, amount: 40_00, status: "open" },
  });

  // ── G. чужая клиника (tenant isolation) ──────────────────────────────
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-debt-clinic-b" },
    update: {},
    create: { name: "E2E Debt B", slug: "e2e-debt-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EDebt", phone: "+994501239998" },
  });
  const invoiceB = await prisma.invoice.create({
    data: {
      clinicId: clinicB.id,
      patientId: patientB.id,
      number: 999601,
      status: "issued",
      subtotal: 70_00,
      total: 70_00,
      paidAmount: 0,
    },
  });
  const debtB = await prisma.debt.create({
    data: { clinicId: clinicB.id, patientId: patientB.id, invoiceId: invoiceB.id, amount: 70_00, status: "open" },
  });

  try {
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // ── A. Candidate listing: unpaid invoice появляется, остаток верный ──
    const debtsPage = await owner.get("/finance/debts");
    check("/finance/debts: страница открывается, заголовок Borclar", debtsPage.html.includes("Borclar"));
    check("queue: DebtOpen (unpaid) виден", debtsPage.html.includes("E2E47 DebtOpen"));
    check("queue: остаток DebtOpen верный (100,00)", debtsPage.html.includes(fmtNum(100_00)));

    // ── B. Partial payment: появляется, остаток верный (50,00) ───────────
    check("queue: DebtPartial (частично оплачен) виден", debtsPage.html.includes("E2E47 DebtPartial"));
    check("queue: остаток DebtPartial верный (50,00)", debtsPage.html.includes(fmtNum(50_00)));

    // ── C. Fully paid: НЕ появляется в очереди ────────────────────────────
    check("queue: DebtPaid (полностью оплачен) НЕ виден", !debtsPage.html.includes("E2E47 DebtPaid"));

    // ── E. No phone: всё равно виден в очереди (кнопка просто отключена) ─
    check("queue: DebtNoPhone виден (без телефона, но в очереди)", debtsPage.html.includes("E2E47 DebtNoPhone"));

    // ── G. Tenant isolation: чужой пациент не виден ───────────────────────
    check("queue: чужой пациент (clinic B) не виден", !debtsPage.html.includes("Foreign E2EDebt"));

    // форма-носитель $ACTION (валидна для prepareInvoiceReminder на любой строке)
    const carrierForm = formContaining(debtsPage.html, 'name="invoiceId"', `value="${invoiceOpen.id}"`);
    check("queue: форма Ödəniş xatırlatması hazırla найдена для DebtOpen", !!carrierForm);

    // ── D. WhatsApp prepare: успешная подготовка ──────────────────────────
    const beforeOpen = await prisma.notification.count({ where: { invoiceId: invoiceOpen.id, type: "payment_reminder" } });
    await owner.postForm("/finance/debts", carrierForm, { invoiceId: invoiceOpen.id });
    const recordOpen = await prisma.notification.findFirst({
      where: { invoiceId: invoiceOpen.id, type: "payment_reminder" },
      orderBy: { createdAt: "desc" },
    });
    check("prepare: создана запись status=prepared, channel=whatsapp",
      !!recordOpen && recordOpen.status === "prepared" && recordOpen.channel === "whatsapp");
    check("prepare: текст содержит имя пациента и остаток",
      !!recordOpen && recordOpen.body.includes("E2E47 DebtOpen") && recordOpen.body.includes(fmtNum(100_00)));
    if (recordOpen) cleanupNotificationIds.push(recordOpen.id);
    const afterOpen = await prisma.notification.count({ where: { invoiceId: invoiceOpen.id, type: "payment_reminder" } });
    check("prepare: ровно 1 новая запись", afterOpen === beforeOpen + 1);

    const debtOpenAfter = await prisma.debt.findUniqueOrThrow({ where: { id: debtOpen.id } });
    check("prepare: lastReminderAt обновлён", !!debtOpenAfter.lastReminderAt);

    const invPageAfter = await owner.get(`/patients/${patientOpen.id}/finance`);
    check("регрессия: страница финансов пациента открывается", invPageAfter.status === 200);

    // ── C (часть 2). Fully paid: действие отклоняет ────────────────────────
    const beforePaid = await prisma.notification.count({ where: { invoiceId: invoicePaid.id } });
    await owner.postForm("/finance/debts", carrierForm, { invoiceId: invoicePaid.id });
    const afterPaid = await prisma.notification.count({ where: { invoiceId: invoicePaid.id } });
    check("fully paid: запись не создаётся", afterPaid === beforePaid, `before=${beforePaid} after=${afterPaid}`);
    const debtPaidAfter = await prisma.debt.findUniqueOrThrow({ where: { id: debtPaid.id } });
    check("fully paid: lastReminderAt не тронут", debtPaidAfter.lastReminderAt === null);

    // ── E (часть 2). No phone: действие отклоняет, запись не создаётся ────
    const beforeNoPhone = await prisma.notification.count({ where: { invoiceId: invoiceNoPhone.id } });
    await owner.postForm("/finance/debts", carrierForm, { invoiceId: invoiceNoPhone.id });
    const afterNoPhone = await prisma.notification.count({ where: { invoiceId: invoiceNoPhone.id } });
    check("no phone: запись не создаётся", afterNoPhone === beforeNoPhone, `before=${beforeNoPhone} after=${afterNoPhone}`);
    const debtNoPhoneAfter = await prisma.debt.findUniqueOrThrow({ where: { id: debtNoPhone.id } });
    check("no phone: lastReminderAt не тронут", debtNoPhoneAfter.lastReminderAt === null);

    // ── F. Permissions: assistant без finance.view ─────────────────────────
    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    const asstDebts = await asst.get("/finance/debts");
    check("assistant: /finance/debts недоступна (нет finance.view)",
      asstDebts.status === 307 || asstDebts.status === 303 || !asstDebts.html.includes("Borclar"));
    const beforeAsst = await prisma.notification.count({ where: { invoiceId: invoiceOpen.id } });
    await asst.postForm("/finance/debts", carrierForm, { invoiceId: invoiceOpen.id });
    const afterAsst = await prisma.notification.count({ where: { invoiceId: invoiceOpen.id } });
    check("assistant: подготовка напоминания отклонена (нет finance.manage)", afterAsst === beforeAsst);

    // ── G (часть 2). Tenant isolation: чужой счёт не готовится ─────────────
    const beforeForeign = await prisma.notification.count({ where: { invoiceId: invoiceB.id } });
    await owner.postForm("/finance/debts", carrierForm, { invoiceId: invoiceB.id });
    const afterForeign = await prisma.notification.count({ where: { invoiceId: invoiceB.id } });
    check("owner (clinic A): чужой счёт (clinic B) не готовится", afterForeign === beforeForeign);
    const debtBAfter = await prisma.debt.findUniqueOrThrow({ where: { id: debtB.id } });
    check("tenant isolation: lastReminderAt чужого долга не тронут", debtBAfter.lastReminderAt === null);

    // ── H. Регрессия: основные страницы открываются ────────────────────────
    check("/finance открывается", (await owner.get("/finance")).status === 200);
    const financePage = await owner.get("/finance");
    check("/finance: ссылка на Borclar видна", financePage.html.includes("/finance/debts"));
    check("/dashboard открывается", (await owner.get("/dashboard")).status === 200);
  } finally {
    await prisma.notification.deleteMany({ where: { id: { in: cleanupNotificationIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: [invoiceOpen.id, invoicePartial.id, invoicePaid.id, invoiceNoPhone.id] } } });
    await prisma.debt.deleteMany({ where: { invoiceId: { in: [invoiceOpen.id, invoicePartial.id, invoicePaid.id, invoiceNoPhone.id] } } });
    await prisma.invoice.deleteMany({ where: { id: { in: [invoiceOpen.id, invoicePartial.id, invoicePaid.id, invoiceNoPhone.id] } } });
    await prisma.patient.deleteMany({ where: { id: { in: [patientOpen.id, patientPartial.id, patientPaid.id, patientNoPhone.id] } } });
    await prisma.payment.deleteMany({ where: { invoiceId: invoiceB.id } });
    await prisma.debt.delete({ where: { id: debtB.id } }).catch(() => {});
    await prisma.invoice.delete({ where: { id: invoiceB.id } }).catch(() => {});
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
