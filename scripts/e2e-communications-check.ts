/**
 * E2E-проверка модуля Patient Communication v1 (сессия 15, dev-скрипт):
 *   npx tsx scripts/e2e-communications-check.ts
 * Требует dev-сервер + seed. Проверяет: лог коммуникаций (Əlaqə tarixçəsi),
 * WhatsApp click-to-chat (appointment/invoice/document), нормализацию
 * телефона, кандидатов напоминаний на dashboard, permissions/scope.
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

/** Локальные копии чистых функций из lib/communications.ts (без алиаса @/ для tsx). */
function normalizeAzPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("994")) {
    // уже в международном формате
  } else if (digits.startsWith("0")) {
    digits = `994${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `994${digits}`;
  } else {
    return null;
  }
  return /^994\d{9}$/.test(digits) ? digits : null;
}

function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function appointmentReminderMessage(opts: {
  patientName: string;
  clinicName: string;
  date: string;
  time: string;
}): string {
  return (
    `Salam, ${opts.patientName}. ${opts.clinicName} tərəfindən xatırlatma: ` +
    `qəbulunuz ${opts.date} saat ${opts.time}-da planlaşdırılıb. ` +
    `Zəhmət olmasa vaxtında gələsiniz.`
  );
}

/** Все <form>...</form> на странице (RSC-стрим кладёт пропсы в JSON, поэтому
 * выделяем формы целиком и фильтруем по их собственному содержимому). */
function forms(html: string): string[] {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

/** Первая форма, содержащая все указанные подстроки. */
function formContaining(html: string, ...needles: string[]): string {
  return forms(html).find((f) => needles.every((n) => f.includes(n))) ?? "";
}

async function main() {
  console.log(`E2E communications check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994501112233" } });
  const leyla = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994552223344" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, phone: "+994703334455" } });
  const aysu = await prisma.patient.findFirstOrThrow({ where: { clinicId: clinic.id, firstName: "Aysu" } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const seedInvoice = await prisma.invoice.findFirstOrThrow({
    where: { clinicId: clinic.id, notes: "demo-seed-invoice" },
  });

  const cleanupNotificationIds: string[] = [];
  const cleanupAppointmentIds: string[] = [];
  const cleanupDocumentIds: string[] = [];

  // чужая клиника + пациент (cross-tenant)
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-comm-clinic-b" },
    update: {},
    create: { name: "E2E Comm B", slug: "e2e-comm-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EComm", phone: "+994501239999" },
  });

  // временный приём для Aysu (нет телефона) — на сегодня
  const todayStart10 = new Date();
  todayStart10.setHours(9, 0, 0, 0);
  const aysuAppt = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: aysu.id,
      doctorId: doctor.id,
      startsAt: todayStart10,
      endsAt: new Date(todayStart10.getTime() + 30 * 60_000),
      status: "scheduled",
      complaint: "e2e-comm: no phone",
      createdById: adminUser.id,
    },
  });
  cleanupAppointmentIds.push(aysuAppt.id);

  // временный загруженный документ для Resad (для WhatsApp document message)
  const resadDoc = await prisma.document.create({
    data: {
      clinicId: clinic.id,
      patientId: resad.id,
      type: "other",
      title: "E2E Arayış.pdf",
      fileUrl: `documents/${clinic.id}/${resad.id}/e2e-arayis.pdf`,
      mimeType: "application/pdf",
      fileSize: 1234,
      uploadedById: adminUser.id,
    },
  });
  cleanupDocumentIds.push(resadDoc.id);

  try {
    // ── 1. WhatsApp URL generation/encoding (unit-level) ─────────────
    const phone = normalizeAzPhone("050 111 22 33");
    check("normalizeAzPhone: '050 111 22 33' → '994501112233'", phone === "994501112233", `got ${phone}`);
    check("normalizeAzPhone: '+994501112233' → '994501112233'", normalizeAzPhone("+994501112233") === "994501112233");
    check("normalizeAzPhone: '994501112233' → '994501112233'", normalizeAzPhone("994501112233") === "994501112233");
    check("normalizeAzPhone: некорректный номер → null", normalizeAzPhone("12345") === null);
    check("normalizeAzPhone: нет телефона → null", normalizeAzPhone(null) === null);

    const sampleText = appointmentReminderMessage({
      patientName: "Həsənov Rəşad",
      clinicName: "Demo Klinika",
      date: "14.06.2026",
      time: "10:00",
    });
    check("appointment reminder: AZ-текст по шаблону",
      sampleText.includes("Salam, Həsənov Rəşad.") &&
        sampleText.includes("Demo Klinika") &&
        sampleText.includes("qəbulunuz 14.06.2026 saat 10:00-da planlaşdırılıb"));
    const sampleUrl = buildWhatsAppUrl("994501112233", sampleText);
    check("wa.me URL: правильный хост + encoded text",
      sampleUrl.startsWith("https://wa.me/994501112233?text=") &&
        sampleUrl.includes(encodeURIComponent("Salam,")) &&
        decodeURIComponent(sampleUrl.split("?text=")[1]) === sampleText);

    // ── owner: login ──────────────────────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // ── 2. WhatsApp appointment reminder (resad, есть телефон) ───────
    const resadPage = await owner.get(`/patients/${resad.id}`);
    check("патиент-страница: видна Əlaqə tarixçəsi", resadPage.html.includes("Əlaqə tarixçəsi"));

    const resadAppt = await prisma.appointment.findFirstOrThrow({ where: { clinicId: clinic.id, patientId: resad.id, notes: "demo-seed:Diş ağrısı (16)" } });
    const dashBefore = await owner.get("/dashboard");
    check("dashboard: панель Bugünkü xatırlatmalar видна", dashBefore.html.includes("Bugünkü xatırlatmalar"));
    const reminderForm = formContaining(dashBefore.html, 'name="appointmentId"', `value="${resadAppt.id}"`);
    check("форма WhatsApp xatırlatma найдена для приёма Resad (dashboard)", !!reminderForm);

    const beforeReminder = await prisma.notification.count({ where: { patientId: resad.id, type: "appointment_reminder" } });
    await owner.postForm(`/dashboard`, reminderForm, { appointmentId: resadAppt.id });
    const reminderRecord = await prisma.notification.findFirst({
      where: { patientId: resad.id, type: "appointment_reminder", appointmentId: resadAppt.id },
      orderBy: { createdAt: "desc" },
    });
    check("prepareAppointmentReminder: создана запись status=prepared",
      !!reminderRecord && reminderRecord.status === "prepared" && reminderRecord.channel === "whatsapp");
    check("prepareAppointmentReminder: текст содержит имя пациента и клинику",
      !!reminderRecord && reminderRecord.body.includes("Həsənov Rəşad") && reminderRecord.body.includes("Demo Klinika"));
    if (reminderRecord) cleanupNotificationIds.push(reminderRecord.id);
    const afterReminder = await prisma.notification.count({ where: { patientId: resad.id, type: "appointment_reminder" } });
    check("prepareAppointmentReminder: ровно 1 новая запись", afterReminder === beforeReminder + 1);

    // ── 3. Əlaqə tarixçəsi показывает новую запись ────────────────────
    const resadPage2 = await owner.get(`/patients/${resad.id}`);
    check("история коммуникаций: appointment_reminder виден на странице",
      resadPage2.html.includes("Salam, Həsənov Rəşad"));

    // ── 4. Ручная запись (форма логирования коммуникации) ─────────────
    const logForm = formContaining(resadPage2.html, 'name="message"', 'name="patientId"', 'name="channel"');
    check("форма логирования коммуникации (message/patientId/channel) найдена", !!logForm);
    const manualText = "E2E ручная заметка о звонке";
    await owner.postForm(`/patients/${resad.id}`, logForm, {
      patientId: resad.id,
      channel: "phone",
      message: manualText,
    });
    const manualRecord = await prisma.notification.findFirst({
      where: { patientId: resad.id, type: "manual_note", body: manualText },
    });
    check("logPatientCommunication: запись manual_note создана",
      !!manualRecord && manualRecord.channel === "phone" && manualRecord.status === "prepared" &&
        manualRecord.createdById === adminUser.id);
    if (manualRecord) cleanupNotificationIds.push(manualRecord.id);
    const resadPage3 = await owner.get(`/patients/${resad.id}`);
    check("история коммуникаций: manual_note виден на странице", resadPage3.html.includes(manualText));

    // ── 5. Missing phone блокирует prepareAppointmentReminder (Aysu) ──
    const beforeAysu = await prisma.notification.count({ where: { appointmentId: aysuAppt.id } });
    await owner.postForm(`/patients/${resad.id}`, reminderForm, { appointmentId: aysuAppt.id });
    const afterAysu = await prisma.notification.count({ where: { appointmentId: aysuAppt.id } });
    check("prepareAppointmentReminder: без телефона — лог не создаётся", afterAysu === beforeAysu, `before=${beforeAysu} after=${afterAysu}`);

    // ── 6. Invoice payment reminder ───────────────────────────────────
    const invPage = await owner.get(`/finance/invoices/${seedInvoice.id}`);
    const invReminderForm = formContaining(invPage.html, "WhatsApp ödəniş xatırlatması", 'name="invoiceId"');
    check("форма WhatsApp ödəniş xatırlatması найдена на счёте", !!invReminderForm);
    const beforeInvReminder = await prisma.notification.count({ where: { invoiceId: seedInvoice.id, type: "payment_reminder" } });
    await owner.postForm(`/finance/invoices/${seedInvoice.id}`, invReminderForm, { invoiceId: seedInvoice.id });
    const invReminderRecord = await prisma.notification.findFirst({
      where: { invoiceId: seedInvoice.id, type: "payment_reminder" },
      orderBy: { createdAt: "desc" },
    });
    const balance = seedInvoice.total - seedInvoice.paidAmount;
    const balanceStr = (balance / 100).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    check("prepareInvoiceReminder: создана запись с балансом счёта",
      !!invReminderRecord && invReminderRecord.channel === "whatsapp" && invReminderRecord.status === "prepared" &&
        invReminderRecord.body.includes(balanceStr));
    if (invReminderRecord) cleanupNotificationIds.push(invReminderRecord.id);
    const afterInvReminder = await prisma.notification.count({ where: { invoiceId: seedInvoice.id, type: "payment_reminder" } });
    check("prepareInvoiceReminder: ровно 1 новая запись", afterInvReminder === beforeInvReminder + 1);

    // ── 7. Document message — не содержит приватной ссылки ───────────
    const resadPage4 = await owner.get(`/patients/${resad.id}`);
    const docMsgForm = formContaining(resadPage4.html, "WhatsApp mesaj hazırla", 'name="documentId"');
    check("форма WhatsApp mesaj hazırla найдена для загруженного документа", !!docMsgForm);
    await owner.postForm(`/patients/${resad.id}`, docMsgForm, { documentId: resadDoc.id });
    const docMsgRecord = await prisma.notification.findFirst({
      where: { documentId: resadDoc.id, type: "document_message" },
      orderBy: { createdAt: "desc" },
    });
    check("prepareDocumentMessage: создана запись",
      !!docMsgRecord && docMsgRecord.channel === "whatsapp" && docMsgRecord.status === "prepared");
    check("prepareDocumentMessage: текст НЕ содержит приватную ссылку/fileUrl",
      !!docMsgRecord && !docMsgRecord.body.includes("/api/documents") && !docMsgRecord.body.includes(resadDoc.fileUrl) &&
        !docMsgRecord.body.includes(resadDoc.id));
    check("prepareDocumentMessage: текст сообщает, что документ готов в клинике",
      !!docMsgRecord && docMsgRecord.body.includes("klinikada hazırdır") && docMsgRecord.body.includes("E2E Arayış.pdf"));
    if (docMsgRecord) cleanupNotificationIds.push(docMsgRecord.id);

    // ── 8. Dashboard: Bugünkü xatırlatmalar ───────────────────────────
    const dash = await owner.get("/dashboard");
    check("dashboard: панель Bugünkü xatırlatmalar видна", dash.html.includes("Bugünkü xatırlatmalar"));
    check("dashboard: пациент Resad (alreadyPrepared) виден", dash.html.includes("Həsənov Rəşad"));
    check("dashboard: пациент Leyla (today appt) виден", dash.html.includes("Quliyeva Leyla"));
    check("dashboard: бейдж 'Hazırlanıb' у уже подготовленного", dash.html.includes("Hazırlanıb"));

    // ── 9. Doctor: cross-patient-scope denial ─────────────────────────
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    const turalAsHekim = await hekim.get(`/patients/${tural.id}`);
    check("doctor: пациент вне scope → 404",
      turalAsHekim.status === 200 &&
        (turalAsHekim.html.includes("404") || turalAsHekim.html.includes("tapılmadı")) &&
        !turalAsHekim.html.includes("Tural"));

    const resadAsHekim = await hekim.get(`/patients/${resad.id}`);
    const hekimLogForm = formContaining(resadAsHekim.html, 'name="message"', 'name="patientId"', 'name="channel"');
    check("doctor: своя форма логирования коммуникации найдена", !!hekimLogForm);
    const beforeTuralLog = await prisma.notification.count({ where: { patientId: tural.id, type: "manual_note" } });
    await hekim.postForm(`/patients/${resad.id}`, hekimLogForm, {
      patientId: tural.id,
      channel: "phone",
      message: "e2e: doctor cross-scope blocked",
    });
    const afterTuralLog = await prisma.notification.count({ where: { patientId: tural.id, type: "manual_note" } });
    check("doctor: лог для пациента вне scope блокирован", afterTuralLog === beforeTuralLog);

    // ── 10. Cross-tenant denial ────────────────────────────────────────
    const beforeForeignLog = await prisma.notification.count({ where: { patientId: patientB.id } });
    await owner.postForm(`/patients/${resad.id}`, logForm, {
      patientId: patientB.id,
      channel: "phone",
      message: "e2e: cross-tenant blocked",
    });
    const afterForeignLog = await prisma.notification.count({ where: { patientId: patientB.id } });
    check("owner (clinic A): лог для пациента другой клиники блокирован", afterForeignLog === beforeForeignLog);

    // ── 11. Регрессия: существующие страницы открываются ─────────────
    check("/documents открывается", (await owner.get("/documents")).status === 200);
    check("/notifications открывается", (await owner.get("/notifications")).status === 200);
    check("/dashboard открывается", dash.status === 200);
    check("страница пациента открывается", resadPage.status === 200);
    check("страница счёта открывается", invPage.status === 200);
  } finally {
    await prisma.notification.deleteMany({ where: { id: { in: cleanupNotificationIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: cleanupAppointmentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: cleanupDocumentIds } } });
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
