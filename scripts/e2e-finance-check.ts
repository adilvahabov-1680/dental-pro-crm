/**
 * E2E-проверка модуля Maliyyə (dev-скрипт):
 *   npx tsx scripts/e2e-finance-check.ts
 * Требует dev-сервер + seed. Техника: HTTP + cookie-jar + progressive-
 * enhancement формы server actions (как остальные e2e).
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
  async postForm(
    path: string,
    pageHtml: string,
    fields: Record<string, string | string[]>,
  ) {
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

/**
 * Фрагмент конкретной формы по маркеру внутри неё. Страница счёта теперь
 * содержит две server-action формы (оплата + отмена) — postForm должен
 * получать $ACTION-поля только нужной формы.
 */
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

async function main() {
  console.log(`E2E finance check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });

  // сброс e2e-счетов прошлых прогонов (включая cancel-тесты)
  const oldInvoices = await prisma.invoice.findMany({
    where: { notes: { in: ["e2e-invoice", "e2e-cancel"] } },
  });
  for (const inv of oldInvoices) {
    await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.debt.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.treatmentItem.updateMany({
      where: { invoiceId: inv.id },
      data: { invoiceId: null },
    });
    await prisma.invoice.delete({ where: { id: inv.id } });
  }
  await prisma.treatmentItem.deleteMany({
    where: { clinicId: clinic.id, notes: "e2e-cancel-item" },
  });

  // 1. seed: invoice/payment/debt
  const seedInvoice = await prisma.invoice.findFirstOrThrow({
    where: { clinicId: clinic.id, notes: "demo-seed-invoice" },
  });
  check("seed: invoice 170 AZN, paid 100, partially_paid",
    seedInvoice.total === 170_00 && seedInvoice.paidAmount === 100_00 && seedInvoice.status === "partially_paid");
  const seedDebt = await prisma.debt.findFirstOrThrow({ where: { invoiceId: seedInvoice.id } });
  check("seed: debt 70 AZN (partial)", seedDebt.amount === 70_00 && seedDebt.status === "partial");

  // 2-5. страницы
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const financePage = await owner.get("/finance");
  check("/finance: summary + счёт виден",
    financePage.html.includes("Qalıq borc") && financePage.html.includes("INV-0000"));
  const patientPage = await owner.get(`/patients/${resad.id}`);
  check("карточка пациента: блок Ödənişlər с борг-бейджем",
    patientPage.html.includes("Ödənişlər") && patientPage.html.includes("Borc"));
  const pfPage = await owner.get(`/patients/${resad.id}/finance`);
  check("страница финансов пациента открывается", pfPage.html.includes("INV-0000"));
  const invPage = await owner.get(`/finance/invoices/${seedInvoice.id}`);
  check("страница счёта: items + payments + форма оплаты",
    invPage.html.includes("Diş 16") && invPage.html.includes("Nağd") && invPage.html.includes('name="amount"'));

  // 21. treatment item показывает связь со счётом
  const ptTreat = await owner.get(`/patients/${resad.id}/treatments`);
  check("процедура показывает бейдж счёта (Hesabda)",
    ptTreat.html.includes(`/finance/invoices/${seedInvoice.id}`));

  // 9. создание счёта из свободной done-процедуры — детерминированно по seed-маркеру
  // (в БД могут быть done-остатки других e2e-скриптов)
  const freeItem = await prisma.treatmentItem.findFirstOrThrow({
    where: {
      clinicId: clinic.id,
      patientId: resad.id,
      status: "done",
      invoiceId: null,
      notes: "demo-seed:Profilaktik təmizlik:free",
    },
  });
  // максимум ДО создания — сид может содержать больше одного invoice
  // (сессия 73: добавлен "demo-seed-fresh-invoice" для Doctor Daily Report),
  // поэтому "следующий номер" считаем от факта, а не от конкретного seedInvoice
  const maxNumBefore = (
    await prisma.invoice.aggregate({ where: { clinicId: clinic.id }, _max: { number: true } })
  )._max.number ?? 0;
  const newInvPage = await owner.get(`/finance/invoices/new?patientId=${resad.id}`);
  check("форма создания: billable-процедура видна", newInvPage.html.includes("Profilaktik"));
  const created = await owner.postForm(
    `/finance/invoices/new?patientId=${resad.id}`,
    newInvPage.html,
    { patientId: resad.id, itemIds: [freeItem.id], notes: "e2e-invoice" },
  );
  const newInvId = (created.location ?? "").match(/\/finance\/invoices\/([0-9a-f-]{36})/)?.[1];
  check("createInvoice → 303 на счёт", created.status === 303 && !!newInvId, `got ${created.status}`);
  const newInv = await prisma.invoice.findUniqueOrThrow({ where: { id: newInvId! } });
  check("invoice: total 50, issued", newInv.total === 50_00 && newInv.status === "issued");
  // 24. нумерация per clinic: следующий номер
  check("нумерация: number = max+1", newInv.number === maxNumBefore + 1,
    `maxBefore ${maxNumBefore}, new ${newInv.number}`);
  const linkedItem = await prisma.treatmentItem.findUniqueOrThrow({ where: { id: freeItem.id } });
  check("treatmentItem.invoiceId связан", linkedItem.invoiceId === newInv.id);
  // 19. debt создан
  const newDebt = await prisma.debt.findFirstOrThrow({ where: { invoiceId: newInv.id } });
  check("debt создан (50, open)", newDebt.amount === 50_00 && newDebt.status === "open");
  // 22. audit
  check("audit_log: invoice create",
    !!(await prisma.auditLog.findFirst({ where: { entityType: "invoice", entityId: newInv.id } })));

  // 11. повторное выставление той же процедуры блокировано
  const before = await prisma.invoice.count({ where: { clinicId: clinic.id } });
  await owner.postForm(`/finance/invoices/new?patientId=${resad.id}`, newInvPage.html, {
    patientId: resad.id,
    itemIds: [freeItem.id],
    notes: "e2e-double",
  });
  check("уже выставленная процедура не выставляется снова",
    (await prisma.invoice.count({ where: { clinicId: clinic.id } })) === before &&
      (await prisma.invoice.findFirst({ where: { notes: "e2e-double" } })) === null);

  // 10. in_progress нельзя выставить
  const inProgress = await prisma.treatmentItem.findFirstOrThrow({
    where: { clinicId: clinic.id, patientId: resad.id, status: "in_progress" },
  });
  await owner.postForm(`/finance/invoices/new?patientId=${resad.id}`, newInvPage.html, {
    patientId: resad.id,
    itemIds: [inProgress.id],
    notes: "e2e-inprogress",
  });
  check("in_progress процедура не выставляется",
    (await prisma.invoice.findFirst({ where: { notes: "e2e-inprogress" } })) === null);

  // 12-13. невалидные ids
  const fake = "00000000-0000-4000-8000-000000000999";
  await owner.postForm(`/finance/invoices/new?patientId=${resad.id}`, newInvPage.html, {
    patientId: fake,
    itemIds: [freeItem.id],
    notes: "e2e-bad-patient",
  });
  check("чужой patientId блокирован",
    (await prisma.invoice.findFirst({ where: { notes: "e2e-bad-patient" } })) === null);
  await owner.postForm(`/finance/invoices/new?patientId=${resad.id}`, newInvPage.html, {
    patientId: resad.id,
    itemIds: [fake],
    notes: "e2e-bad-item",
  });
  check("несуществующий treatmentItemId блокирован",
    (await prisma.invoice.findFirst({ where: { notes: "e2e-bad-item" } })) === null);

  // 15-18. оплаты: частичная → partially_paid, переплата блок, полная → paid
  const newInvDetail = await owner.get(`/finance/invoices/${newInv.id}`);
  const payFrag = formFragment(newInvDetail.html, 'name="amount"');
  await owner.postForm(`/finance/invoices/${newInv.id}`, payFrag, {
    invoiceId: newInv.id,
    amount: "20",
    method: "card",
    note: "e2e-pay-1",
  });
  const afterPartial = await prisma.invoice.findUniqueOrThrow({ where: { id: newInv.id } });
  check("частичная оплата 20 → paidAmount 20, partially_paid",
    afterPartial.paidAmount === 20_00 && afterPartial.status === "partially_paid");
  const debtAfterPartial = await prisma.debt.findFirstOrThrow({ where: { invoiceId: newInv.id } });
  check("debt после оплаты: 30 (partial)",
    debtAfterPartial.amount === 30_00 && debtAfterPartial.status === "partial");
  check("audit_log: payment create",
    !!(await prisma.auditLog.findFirst({
      where: { entityType: "payment", entityId: newInv.id },
    })));

  // переплата (остаток 30, платим 100) → блок
  await owner.postForm(`/finance/invoices/${newInv.id}`, payFrag, {
    invoiceId: newInv.id,
    amount: "100",
    method: "cash",
    note: "e2e-overpay",
  });
  const afterOver = await prisma.invoice.findUniqueOrThrow({ where: { id: newInv.id } });
  check("переплата заблокирована (paidAmount не изменился)", afterOver.paidAmount === 20_00);
  check("переплата: payment не создан",
    (await prisma.payment.findFirst({ where: { notes: "e2e-overpay" } })) === null);

  // полная оплата остатка 30 → paid, debt closed
  await owner.postForm(`/finance/invoices/${newInv.id}`, payFrag, {
    invoiceId: newInv.id,
    amount: "30",
    method: "transfer",
    note: "e2e-pay-2",
  });
  const afterFull = await prisma.invoice.findUniqueOrThrow({ where: { id: newInv.id } });
  check("полная оплата → status paid", afterFull.status === "paid" && afterFull.paidAmount === 50_00);
  const debtClosed = await prisma.debt.findFirstOrThrow({ where: { invoiceId: newInv.id } });
  check("debt закрыт (0, closed)", debtClosed.amount === 0 && debtClosed.status === "closed");

  // 14. payment к чужому/несуществующему invoice блокирован
  await owner.postForm(`/finance/invoices/${newInv.id}`, payFrag, {
    invoiceId: fake,
    amount: "10",
    method: "cash",
    note: "e2e-bad-invoice",
  });
  check("несуществующий invoiceId блокирован",
    (await prisma.payment.findFirst({ where: { notes: "e2e-bad-invoice" } })) === null);

  // 6-7. doctor: view своих, нет manage-форм, чужой пациент → 404
  const hekim = new Session();
  check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
  const hekimFinance = await hekim.get("/finance");
  check("doctor видит счета своих пациентов", hekimFinance.html.includes("INV-0000"));
  check("doctor (view-only): кнопки Hesab yarat нет",
    !hekimFinance.html.includes("/finance/invoices/new"));
  const hekimInv = await hekim.get(`/finance/invoices/${seedInvoice.id}`);
  check("doctor: счёт открывается, формы оплаты нет",
    hekimInv.html.includes("Diş 16") && !hekimInv.html.includes('name="amount"'));
  const hekimForeign = await hekim.get(`/patients/${tural.id}/finance`);
  check("doctor: финансы чужого пациента → 404/нет утечки",
    hekimForeign.status === 404 || !hekimForeign.html.includes("Tural"));

  // 8. assistant: нет finance.view → недоступно; POST create отклонён
  const asst = new Session();
  check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
  const asstFinance = await asst.get("/finance");
  check("assistant: /finance недоступна (нет view)",
    asstFinance.status === 307 || asstFinance.status === 303 || !asstFinance.html.includes("Qalıq borc"));
  const invBefore = await prisma.invoice.count({ where: { clinicId: clinic.id } });
  await asst.postForm(`/finance/invoices/new?patientId=${resad.id}`, newInvPage.html, {
    patientId: resad.id,
    itemIds: [freeItem.id],
    notes: "e2e-asst",
  });
  check("assistant: POST create отклонён",
    (await prisma.invoice.count({ where: { clinicId: clinic.id } })) === invBefore);

  // ── Cancel invoice (сессия 11) ─────────────────────────────────────
  const profSvc = await prisma.service.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Profilaktik təmizlik" },
  });
  const doctorA = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const cancelItem = await prisma.treatmentItem.create({
    data: {
      clinicId: clinic.id,
      patientId: resad.id,
      doctorId: doctorA.id,
      serviceId: profSvc.id,
      status: "done",
      price: 40_00,
      performedAt: new Date(),
      notes: "e2e-cancel-item",
    },
  });
  const cancelFormPage = await owner.get(`/finance/invoices/new?patientId=${resad.id}`);
  const createdC = await owner.postForm(
    `/finance/invoices/new?patientId=${resad.id}`,
    cancelFormPage.html,
    { patientId: resad.id, itemIds: [cancelItem.id], notes: "e2e-cancel" },
  );
  const cancelInvId = (createdC.location ?? "").match(/\/finance\/invoices\/([0-9a-f-]{36})/)?.[1];
  check("cancel: тестовый счёт создан", !!cancelInvId, `got ${createdC.status}`);

  const cancelPage = await owner.get(`/finance/invoices/${cancelInvId}`);
  check("cancel: кнопка ləğv видна на счёте без оплат",
    cancelPage.html.includes("Hesabı ləğv et"));
  const cancelFrag = formFragment(cancelPage.html, "Hesabı ləğv et");

  // 18. счёт с оплатой (seed: partially_paid) не отменяется
  await owner.postForm(`/finance/invoices/${cancelInvId}`, cancelFrag, {
    invoiceId: seedInvoice.id,
  });
  check("cancel: счёт с оплатой не отменяется (v1)",
    (await prisma.invoice.findUniqueOrThrow({ where: { id: seedInvoice.id } })).status ===
      "partially_paid");
  const paidPage = await owner.get(`/finance/invoices/${newInv.id}`);
  check("cancel: у оплаченного счёта кнопки нет, есть пояснение",
    !paidPage.html.includes("Hesabı ləğv et") && paidPage.html.includes("ləğv edilə bilməz"));

  // 20. чужой счёт не отменяется
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-fin-clinic-b" },
    update: {},
    create: { name: "E2E Fin B", slug: "e2e-fin-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EFin" },
  });
  const invoiceB = await prisma.invoice.create({
    data: {
      clinicId: clinicB.id,
      patientId: patientB.id,
      number: 999001,
      status: "issued",
      subtotal: 10_00,
      total: 10_00,
    },
  });
  await owner.postForm(`/finance/invoices/${cancelInvId}`, cancelFrag, {
    invoiceId: invoiceB.id,
  });
  check("cancel: чужой счёт не отменяется",
    (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } })).status === "issued");

  // 19. assistant без finance.manage не отменяет
  await asst.postForm(`/finance/invoices/${cancelInvId}`, cancelFrag, {
    invoiceId: cancelInvId!,
  });
  check("cancel: assistant отклонён",
    (await prisma.invoice.findUniqueOrThrow({ where: { id: cancelInvId! } })).status === "issued");

  // 15-17. успешная отмена: status, unlink, debt, audit
  await owner.postForm(`/finance/invoices/${cancelInvId}`, cancelFrag, {
    invoiceId: cancelInvId!,
  });
  const cancelledInv = await prisma.invoice.findUniqueOrThrow({ where: { id: cancelInvId! } });
  check("cancel: счёт отменён (status cancelled)", cancelledInv.status === "cancelled");
  const unlinkedItem = await prisma.treatmentItem.findUniqueOrThrow({
    where: { id: cancelItem.id },
  });
  check("cancel: treatment_item отвязан", unlinkedItem.invoiceId === null);
  const cancelledDebt = await prisma.debt.findFirstOrThrow({
    where: { invoiceId: cancelInvId! },
  });
  check("cancel: debt списан (0, written_off)",
    cancelledDebt.amount === 0 && cancelledDebt.status === "written_off");
  check("cancel: payments не созданы/не тронуты",
    (await prisma.payment.count({ where: { invoiceId: cancelInvId! } })) === 0);
  check("cancel: audit_log записан",
    !!(await prisma.auditLog.findFirst({
      where: { entityType: "invoice", entityId: cancelInvId!, action: "update" },
    })));
  // процедура снова доступна для нового счёта
  const reFormPage = await owner.get(`/finance/invoices/new?patientId=${resad.id}`);
  check("cancel: процедура снова billable", reFormPage.html.includes(cancelItem.id));

  // cleanup чужой клиники
  await prisma.invoice.delete({ where: { id: invoiceB.id } });
  await prisma.patient.delete({ where: { id: patientB.id } });
  await prisma.clinic.delete({ where: { id: clinicB.id } });
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
