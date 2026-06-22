/**
 * E2E-проверка Production Hardening / Security Review v1 (сессия 48):
 *   npx tsx scripts/e2e-production-hardening-check.ts
 * Требует dev-сервер + seed. Создаёт собственные данные и удаляет их в finally.
 *
 * Намеренно НЕ дублирует то, что уже исчерпывающе покрыто профильными e2e
 * (запускаются отдельно как регрессия, см. docs/SESSION_HANDOFF.md):
 *   - cross-tenant изоляция response links/reschedule/recall/feedback —
 *     e2e-patient-response-links-check, e2e-patient-reschedule-options-check,
 *     e2e-recall-tasks-check, e2e-patient-feedback-check;
 *   - cross-tenant debt reminders — e2e-debt-reminders-check (полная версия;
 *     здесь — только один компактный spot-check той же механики);
 *   - document download scope/permission/path traversal — e2e-documents-check;
 *   - global search cross-tenant — e2e-global-search-check;
 *   - notification TYPE_PERMISSION матрица — e2e-notifications-check (полная
 *     версия; здесь — один спот-чек той же механики).
 * Этот скрипт добавляет то, что не было явно проверено раньше: отсутствие
 * raw UUID / финансовых / документных данных на публичных /r/[token]
 * страницах, и набор permission-guard проверок в одном месте.
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const FINANCE_TERMS = ["AZN", "INV-", "Qalıq borc", "Ödəniş xatırlatması"];
const DOCUMENT_TERMS = ["fileUrl", "/uploads/", "/api/documents/"];

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
    return { status: res.status };
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
  console.log(`E2E production hardening check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const service = await prisma.service.findFirstOrThrow({ where: { clinicId: clinic.id } });

  // ── репо-гигиена (E) — до сети, не требует dev-сервера ───────────────────
  console.log("E — repo hygiene");
  {
    const { execSync } = await import("node:child_process");
    const tracked = execSync("git ls-files", { cwd: process.cwd() }).toString();
    const forbidden = [/^\.env$/m, /^\.pglocal\//m, /^\.next\//m, /^node_modules\//m, /^uploads\//m];
    const leaked = forbidden.filter((re) => re.test(tracked));
    check("git: .env/.pglocal/.next/node_modules/uploads не затрекены", leaked.length === 0, JSON.stringify(leaked));
  }

  // ── setup: своя клиника A данные ──────────────────────────────────────────
  const patientA = await prisma.patient.create({
    data: { clinicId: clinic.id, firstName: "ProdHard", lastName: "E2E48", phone: "+994501230048" },
  });
  const appointmentA = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      doctorId: doctor.id,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      status: "completed",
      complaint: "e2e-prodhard",
      createdById: adminUser.id,
    },
  });
  const treatmentItemA = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      doctorId: doctor.id,
      serviceId: service.id,
      status: "done",
      price: 40_00,
      performedAt: new Date(),
      notes: "e2e-prodhard-item",
    },
  });
  const invoiceA = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      number: 999801,
      status: "issued",
      subtotal: 55_00,
      total: 55_00,
      paidAmount: 0,
      notes: "e2e-prodhard",
    },
  });
  const debtA = await prisma.debt.create({
    data: { clinicId: clinic.id, patientId: patientA.id, invoiceId: invoiceA.id, amount: 55_00, status: "open" },
  });

  const future = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
  const linkActive = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      appointmentId: appointmentA.id,
      token: "e2eprodhardactive00000000000000000001",
      purpose: "confirm_appointment",
      status: "active",
      expiresAt: future(48),
    } as never,
  });
  const linkUsed = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      appointmentId: appointmentA.id,
      token: "e2eprodhardused0000000000000000000002",
      purpose: "confirm_appointment",
      status: "used",
      respondedAt: new Date(),
      responseType: "confirm",
      expiresAt: future(48),
    } as never,
  });
  const linkExpired = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      appointmentId: appointmentA.id,
      token: "e2eprodhardexpired000000000000000003",
      purpose: "confirm_appointment",
      status: "active",
      expiresAt: future(-1),
    } as never,
  });
  const linkReschedule = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      appointmentId: appointmentA.id,
      token: "e2eprodhardreschedule00000000000004",
      purpose: "reschedule_offer",
      status: "active",
      expiresAt: future(48),
      response: { kind: "options", options: [{ id: "1", startsAt: future(72).toISOString(), endsAt: future(73).toISOString() }] },
    } as never,
  });
  const linkFeedback = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientA.id,
      appointmentId: null,
      token: "e2eprodhardfeedback0000000000000005",
      purpose: "feedback",
      status: "active",
      expiresAt: future(24 * 7),
      response: { kind: "pending_feedback", treatmentItemId: null },
    } as never,
  });

  // ── permission-edge тестовые сотрудники (своя клиника A) ──────────────────
  const receptionRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "reception" } });
  const accountantRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "accountant" } });
  const apptViewPerm = await prisma.permission.findFirstOrThrow({ where: { key: "appointments.view" } });

  const receptionUser = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: receptionRole.id,
      email: "e2e-prodhard-reception@e2e.local",
      fullName: "E2E ProdHard Reception",
      passwordHash: adminUser.passwordHash,
      locale: "az",
    },
  });
  await prisma.userPermission.create({
    data: { userId: receptionUser.id, permissionId: apptViewPerm.id, allowed: false },
  });
  const accountantUser = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: accountantRole.id,
      email: "e2e-prodhard-accountant@e2e.local",
      fullName: "E2E ProdHard Accountant",
      passwordHash: adminUser.passwordHash,
      locale: "az",
    },
  });

  // tenant-level notification (для D — без appointments.view не должен быть виден/считан)
  const markerNotif = await prisma.notification.create({
    data: {
      clinicId: clinic.id,
      channel: "in_app",
      userId: null,
      type: "appointment_reminder",
      body: "e2e-prodhard: appointment_reminder marker",
      status: "pending",
      scheduledAt: new Date(),
    } as never,
  });

  // ── чужая клиника B (для компактного debt-reminder tenant spot-check) ─────
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-prodhard-clinic-b" },
    update: {},
    create: { name: "E2E ProdHard B", slug: "e2e-prodhard-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EProdHard", phone: "+994501239997" },
  });
  const invoiceB = await prisma.invoice.create({
    data: { clinicId: clinicB.id, patientId: patientB.id, number: 999801, status: "issued", subtotal: 70_00, total: 70_00, paidAmount: 0 },
  });
  const debtB = await prisma.debt.create({
    data: { clinicId: clinicB.id, patientId: patientB.id, invoiceId: invoiceB.id, amount: 70_00, status: "open" },
  });

  try {
    // ── A. Public token safety ──────────────────────────────────────────────
    console.log("\nA — public token safety");
    const anon = new Session();

    const garbage = await anon.get(`/r/${"x".repeat(32)}`);
    check("A1: несуществующий (но валидный формат) токен → 200 безопасный экран", garbage.status === 200);
    check("A2: несуществующий токен → generic 'Linkin müddəti bitib'", garbage.html.includes("Linkin müddəti bitib"));
    check("A3: несуществующий токен — нет raw UUID в ответе", !UUID_RE.test(garbage.html));

    const expiredPage = await anon.get(`/r/${linkExpired.token}`);
    check("A4: истёкший токен → generic 'Linkin müddəti bitib'", expiredPage.html.includes("Linkin müddəti bitib"));
    check("A5: истёкший токен — нет raw UUID", !UUID_RE.test(expiredPage.html));

    const usedPage = await anon.get(`/r/${linkUsed.token}`);
    check("A6: использованный токен → 'Bu link artıq istifadə olunub'", usedPage.html.includes("Bu link artıq istifadə olunub"));
    check("A7: использованный токен — нет raw UUID", !UUID_RE.test(usedPage.html));

    const activePage = await anon.get(`/r/${linkActive.token}`);
    check("A8: активный confirm_appointment токен → 200", activePage.status === 200);
    check("A9: активный токен — нет raw UUID", !UUID_RE.test(activePage.html));
    check("A10: активный токен — нет финансовых терминов", !FINANCE_TERMS.some((t) => activePage.html.includes(t)));
    check("A11: активный токен — нет документных терминов", !DOCUMENT_TERMS.some((t) => activePage.html.includes(t)));

    const reschedulePage = await anon.get(`/r/${linkReschedule.token}`);
    check("A12: reschedule_offer токен → 200, показывает выбор вариантов", reschedulePage.status === 200 && reschedulePage.html.includes("Yeni qəbul vaxtı"));
    check("A13: reschedule_offer — нет raw UUID", !UUID_RE.test(reschedulePage.html));
    check("A14: reschedule_offer — нет финансовых/документных терминов",
      !FINANCE_TERMS.some((t) => reschedulePage.html.includes(t)) && !DOCUMENT_TERMS.some((t) => reschedulePage.html.includes(t)));

    const feedbackPage = await anon.get(`/r/${linkFeedback.token}`);
    check("A15: feedback токен → 200, показывает форму отзыва", feedbackPage.status === 200 && feedbackPage.html.includes("Rəy bildirin"));
    check("A16: feedback — нет raw UUID", !UUID_RE.test(feedbackPage.html));
    check("A17: feedback — нет финансовых/документных терминов",
      !FINANCE_TERMS.some((t) => feedbackPage.html.includes(t)) && !DOCUMENT_TERMS.some((t) => feedbackPage.html.includes(t)));

    check("A18: весь публичный flow прошёл без cookie сессии", !anon.cookies.has("dp_session"));

    // ── owner login (используется в B/C) ────────────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // ── B. Tenant isolation — компактный spot-check (debt reminders) ────────
    // Полная cross-tenant матрица по всем модулям — см. профильные e2e
    // (заголовок файла). Здесь только то, что не дублирует их.
    console.log("\nB — tenant isolation (spot-check)");
    const debtsPageOwner = await owner.get("/finance/debts");
    check("B1: clinic A видит свой открытый долг (ProdHard E2E48)", debtsPageOwner.html.includes("E2E48 ProdHard"));
    check("B2: clinic A НЕ видит долг чужой клиники B", !debtsPageOwner.html.includes("Foreign E2EProdHard"));

    const carrierDebtForm = formContaining(debtsPageOwner.html, 'name="invoiceId"', `value="${invoiceA.id}"`);
    check("B3: форма debt-reminder найдена (carrier для B4)", !!carrierDebtForm);
    const beforeForeignNotif = await prisma.notification.count({ where: { invoiceId: invoiceB.id } });
    await owner.postForm("/finance/debts", carrierDebtForm, { invoiceId: invoiceB.id });
    const afterForeignNotif = await prisma.notification.count({ where: { invoiceId: invoiceB.id } });
    check("B4: clinic A не может подготовить напоминание по счёту clinic B", afterForeignNotif === beforeForeignNotif);
    const debtBAfter = await prisma.debt.findUniqueOrThrow({ where: { id: debtB.id } });
    check("B5: lastReminderAt чужого долга не тронут", debtBAfter.lastReminderAt === null);

    // ── C. Permission guards ────────────────────────────────────────────────
    console.log("\nC — permission guards");
    const assistant = new Session();
    check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
    const reception = new Session();
    check("login reception (e2e)", await reception.login("e2e-prodhard-reception@e2e.local"));
    const accountant = new Session();
    check("login accountant (e2e)", await accountant.login("e2e-prodhard-accountant@e2e.local"));

    const asstDebts = await assistant.get("/finance/debts");
    check("C1: assistant (нет finance.view) → /finance/debts отказ", asstDebts.status === 307 || asstDebts.status === 303);

    const accFeedback = await accountant.get("/feedback");
    check("C2: accountant (нет patients.view) → /feedback отказ", accFeedback.status === 307 || accFeedback.status === 303);

    const recReceptionRecalls = await reception.get("/recalls");
    check("C3: reception (нет treatments.view) → /recalls отказ", recReceptionRecalls.status === 307 || recReceptionRecalls.status === 303);

    // C4: assistant (нет finance.manage) не готовит debt reminder
    const beforeA = await prisma.notification.count({ where: { invoiceId: invoiceA.id } });
    await assistant.postForm("/finance/debts", carrierDebtForm, { invoiceId: invoiceA.id });
    const afterA = await prisma.notification.count({ where: { invoiceId: invoiceA.id } });
    check("C4: assistant не может подготовить debt reminder", afterA === beforeA);

    // C5: assistant (нет patients.manage) не готовит feedback link
    const patientPageOwner = await owner.get(`/patients/${patientA.id}`);
    const carrierFeedbackForm = formContaining(patientPageOwner.html, 'name="appointmentId"', `value="${appointmentA.id}"`);
    check("C5a: форма feedback (carrier) найдена на странице пациента (owner)", !!carrierFeedbackForm);
    const beforeLinks = await prisma.patientResponseLink.count({ where: { patientId: patientA.id, purpose: "feedback" } });
    await assistant.postForm(`/patients/${patientA.id}`, carrierFeedbackForm, { appointmentId: appointmentA.id });
    const afterLinks = await prisma.patientResponseLink.count({ where: { patientId: patientA.id, purpose: "feedback" } });
    check("C5b: assistant не может подготовить feedback link", afterLinks === beforeLinks);

    // C6: reception (нет treatments.manage) не создаёт recall task
    const recallPageOwner = await owner.get(`/treatments/${treatmentItemA.id}/recall`);
    const carrierRecallForm = formContaining(recallPageOwner.html, 'name="treatmentItemId"', `value="${treatmentItemA.id}"`);
    check("C6a: форма создания recall (carrier) найдена (owner)", !!carrierRecallForm);
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const beforeRecalls = await prisma.recallTask.count({ where: { patientId: patientA.id } });
    await reception.postForm(`/treatments/${treatmentItemA.id}/recall`, carrierRecallForm, {
      patientId: patientA.id,
      treatmentItemId: treatmentItemA.id,
      dueDate: tomorrow,
      title: "e2e-prodhard-recall-unauthorized",
    });
    const afterRecalls = await prisma.recallTask.count({ where: { patientId: patientA.id } });
    check("C6b: reception не может создать recall task", afterRecalls === beforeRecalls);

    // ── D. Notification scope spot-check ────────────────────────────────────
    console.log("\nD — notification scope (spot-check)");
    const receptionNotifPage = await reception.get("/notifications");
    check("D1: reception (deny appointments.view) НЕ видит marker-уведомление", !receptionNotifPage.html.includes("e2e-prodhard: appointment_reminder marker"));

    const ownerNotifPage = await owner.get("/notifications");
    check("D2: owner (есть appointments.view) видит marker-уведомление", ownerNotifPage.html.includes("e2e-prodhard: appointment_reminder marker"));
    const markRow = formContaining(ownerNotifPage.html, `value="${markerNotif.id}"`);
    check("D3: форма 'mark read' для marker-уведомления найдена", !!markRow);
    await owner.postForm("/notifications", markRow, { id: markerNotif.id });
    const markerAfter = await prisma.notification.findUniqueOrThrow({ where: { id: markerNotif.id } });
    check("D4: owner может пометить видимое уведомление прочитанным", markerAfter.status === "read");

    // ── regression smoke ────────────────────────────────────────────────────
    check("regression: /dashboard открывается (owner)", (await owner.get("/dashboard")).status === 200);
    check("regression: /finance открывается (owner)", (await owner.get("/finance")).status === 200);
  } finally {
    await prisma.notification.deleteMany({ where: { OR: [{ id: markerNotif.id }, { invoiceId: { in: [invoiceA.id, invoiceB.id] } }, { patientId: patientA.id }] } });
    await prisma.patientResponseLink.deleteMany({
      where: { id: { in: [linkActive.id, linkUsed.id, linkExpired.id, linkReschedule.id, linkFeedback.id] } },
    });
    await prisma.userPermission.deleteMany({ where: { userId: receptionUser.id } });
    await prisma.user.deleteMany({ where: { id: { in: [receptionUser.id, accountantUser.id] } } });
    await prisma.debt.deleteMany({ where: { invoiceId: { in: [invoiceA.id, invoiceB.id] } } });
    await prisma.invoice.deleteMany({ where: { id: { in: [invoiceA.id, invoiceB.id] } } });
    await prisma.recallTask.deleteMany({ where: { patientId: patientA.id } });
    await prisma.treatmentItem.deleteMany({ where: { id: treatmentItemA.id } });
    await prisma.appointment.deleteMany({ where: { id: appointmentA.id } });
    await prisma.patient.deleteMany({ where: { id: { in: [patientA.id, patientB.id] } } });
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
