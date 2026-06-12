/**
 * E2E-проверка модуля Ayarlar / Settings v1 (dev-скрипт):
 *   npx tsx scripts/e2e-settings-check.ts
 * Требует dev-сервер + seed. Техника: HTTP + cookie-jar + POST форм
 * server actions; на страницах несколько форм → постится фрагмент
 * конкретной формы (formFragment). Исходные значения клиники/настроек
 * сохраняются и восстанавливаются в конце прогона.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { PDFParse } from "pdf-parse";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
const UPLOADS = path.join(process.cwd(), "uploads");
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
    return {
      status: res.status,
      location: res.headers.get("location") ?? undefined,
      html: res.status < 300 ? await res.text() : "",
    };
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
    return { status: res.status, location: res.headers.get("location") ?? undefined };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

/** Фрагмент конкретной формы по маркеру внутри неё (на странице их несколько). */
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

async function pdfText(relFileUrl: string): Promise<string> {
  const buf = await fs.readFile(path.join(UPLOADS, relFileUrl));
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

const SETTING_KEYS = [
  "doctor_sees_all_patients",
  "reminder_hours_before",
  "default_appointment_minutes",
  "working_hours",
];

async function clinicSetting(clinicId: string, key: string) {
  return prisma.setting.findFirst({
    where: { clinicId, scope: "clinic", doctorId: null, userId: null, key },
  });
}

async function main() {
  console.log(`E2E settings check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });

  // исходное состояние — для восстановления в конце
  const origClinic = {
    name: clinic.name,
    phone: clinic.phone,
    email: clinic.email,
    address: clinic.address,
  };
  const origSettings = new Map<string, Prisma.JsonValue | undefined>();
  for (const key of SETTING_KEYS) {
    origSettings.set(key, (await clinicSetting(clinic.id, key))?.value);
  }

  // сброс остатков прошлых прогонов
  const oldSvc = await prisma.service.findMany({
    where: { clinicId: clinic.id, name: { startsWith: "E2E Xidmət" } },
  });
  for (const s of oldSvc) {
    await prisma.price.deleteMany({ where: { serviceId: s.id } });
    await prisma.service.delete({ where: { id: s.id } });
  }
  await prisma.clinic.deleteMany({ where: { slug: "e2e-settings-clinic-b" } });

  const createdFiles: string[] = [];
  const createdRecordIds: string[] = [];

  try {
    // ── 1. страница настроек (owner) ──
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));
    let page = await owner.get("/settings");
    check("/settings открывается без placeholder",
      page.html.includes("Klinika rekvizitləri") && !page.html.includes("Hazırlanır"));
    check("/settings: все секции (rekvizitlər, parametrlər, iş saatları, xidmətlər)",
      page.html.includes("Qəbul parametrləri") && page.html.includes("İş saatları") &&
      page.html.includes("Xidmətlər və qiymətlər"));

    // ── 2. реквизиты клиники ──
    const profileFrag = formFragment(page.html, 'name="name"');
    await owner.postForm("/settings", profileFrag, {
      name: "Demo Klinika",
      phone: "+994 12 555 66 77",
      email: "e2e@demo.dentalpro.az",
      address: "E2E küçəsi 5, Bakı",
    });
    let c = await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
    check("реквизиты обновлены (phone/email/address)",
      c.phone === "+994 12 555 66 77" && c.email === "e2e@demo.dentalpro.az" &&
      c.address === "E2E küçəsi 5, Bakı");
    check("audit: clinic update",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "clinic", entityId: clinic.id, action: "update" },
      })));

    // валидация: пустое имя / кривой email → без изменений
    await owner.postForm("/settings", profileFrag, {
      name: "", phone: "x", email: "e2e@demo.dentalpro.az", address: "x",
    });
    c = await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
    check("пустое имя отклонено (поля не изменились)", c.phone === "+994 12 555 66 77");
    await owner.postForm("/settings", profileFrag, {
      name: "Demo Klinika", phone: "x", email: "not-an-email", address: "x",
    });
    c = await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
    check("кривой email отклонён", c.email === "e2e@demo.dentalpro.az");

    // ── 3. реквизиты попадают в шапку PDF ──
    const pDocsPage = await owner.get(`/patients/${resad.id}/documents`);
    const sumFrag = formFragment(pDocsPage.html, 'name="patientId"');
    const sumRes = await owner.postForm(`/patients/${resad.id}/documents`, sumFrag, {
      patientId: resad.id,
    });
    const docId = (sumRes.location ?? "").match(/\/documents\/([0-9a-f-]{36})/)?.[1];
    check("PDF çıxarış сгенерирован", !!docId, `got ${sumRes.status}`);
    if (docId) {
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: docId } });
      createdRecordIds.push(rec.id);
      createdFiles.push(rec.fileUrl);
      const text = await pdfText(rec.fileUrl);
      check("PDF шапка: новый телефон клиники", text.includes("+994 12 555 66 77"));
      check("PDF шапка: адрес клиники (был пустой в seed)", text.includes("E2E küçəsi 5"));
    }

    // ── 4. параметры приёма + doctor_sees_all_patients ──
    page = await owner.get("/settings");
    const paramsFrag = formFragment(page.html, 'name="defaultAppointmentMinutes"');
    await owner.postForm("/settings", paramsFrag, {
      defaultAppointmentMinutes: "45",
      reminderHoursBefore: "12",
      doctorSeesAllPatients: "on",
    });
    const minutes = await clinicSetting(clinic.id, "default_appointment_minutes");
    const hours = await clinicSetting(clinic.id, "reminder_hours_before");
    const seesAll = await clinicSetting(clinic.id, "doctor_sees_all_patients");
    check("параметры сохранены (45 дəq / 12 saat)",
      minutes?.value === 45 && hours?.value === 12);
    check("doctor_sees_all_patients = true", seesAll?.value === true);
    check("audit: setting update",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "setting", entityId: seesAll!.id },
      })));
    page = await owner.get("/settings");
    check("страница отражает новые значения", page.html.includes('value="45"'));

    // врач видит пациента без своего primaryDoctor (Tural)
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    // поисковый input сам содержит "Tural" → проверяем по фамилии из строки таблицы
    let ptList = await hekim.get("/patients?q=Tural");
    check("seesAll=true: врач видит Tural", ptList.html.includes("Məmmədov"));

    // выключаем чекбокс (поле отсутствует в POST) → false
    await owner.postForm("/settings", paramsFrag, {
      defaultAppointmentMinutes: "45",
      reminderHoursBefore: "12",
    });
    const seesAllOff = await clinicSetting(clinic.id, "doctor_sees_all_patients");
    check("doctor_sees_all_patients = false после выключения", seesAllOff?.value === false);
    ptList = await hekim.get("/patients?q=Tural");
    check("seesAll=false: врач не видит Tural", !ptList.html.includes("Məmmədov"));

    // валидация числа
    await owner.postForm("/settings", paramsFrag, {
      defaultAppointmentMinutes: "abc",
      reminderHoursBefore: "12",
    });
    const minutesAfter = await clinicSetting(clinic.id, "default_appointment_minutes");
    check("кривое число отклонено (минуты не изменились)", minutesAfter?.value === 45);

    // ── 5. часы работы ──
    const hoursFrag = formFragment(page.html, 'name="enabled_mon"');
    await owner.postForm("/settings", hoursFrag, {
      enabled_mon: "on", from_mon: "09:00", to_mon: "18:00",
      enabled_tue: "on", from_tue: "09:00", to_tue: "18:00",
      enabled_wed: "on", from_wed: "09:00", to_wed: "18:00",
      enabled_thu: "on", from_thu: "09:00", to_thu: "18:00",
      enabled_fri: "on", from_fri: "09:00", to_fri: "18:00",
      enabled_sat: "on", from_sat: "10:00", to_sat: "14:00",
    });
    const wh = await clinicSetting(clinic.id, "working_hours");
    const whVal = wh?.value as Record<string, { from: string; to: string } | null> | undefined;
    check("часы работы сохранены (пн 09–18, сб 10–14, вс закрыто)",
      whVal?.mon?.from === "09:00" && whVal?.sat?.to === "14:00" && whVal?.sun === null);
    page = await owner.get("/settings");
    check("страница показывает сохранённые часы", page.html.includes('value="10:00"'));

    // from ≥ to → отклонено, значение не изменилось
    await owner.postForm("/settings", hoursFrag, {
      enabled_mon: "on", from_mon: "18:00", to_mon: "09:00",
    });
    const wh2 = await clinicSetting(clinic.id, "working_hours");
    const wh2Val = wh2?.value as Record<string, { from: string } | null> | undefined;
    check("обратный диапазон отклонён (часы не изменились)", wh2Val?.mon?.from === "09:00");

    // ── 6. прайс услуг ──
    let svcPage = await owner.get("/settings/services");
    check("/settings/services: услуги seed с ценой",
      svcPage.html.includes("Kanal müalicəsi") && svcPage.html.includes("Konsultasiya"));

    const createFrag = formFragment(svcPage.html, 'name="durationMin"');
    await owner.postForm("/settings/services", createFrag, {
      name: "E2E Xidmət",
      durationMin: "30",
      price: "75,50",
      childPrice: "60",
    });
    const svc = await prisma.service.findFirst({
      where: { clinicId: clinic.id, name: "E2E Xidmət" },
    });
    check("услуга создана (30 дəq)", !!svc && svc.durationMin === 30);
    const price1 = await prisma.price.findFirst({
      where: { serviceId: svc!.id, validTo: null },
    });
    check("цена создана: 75.50 / uşaq 60.00, validTo = null",
      price1?.price === 75_50 && price1?.childPrice === 60_00);
    check("audit: service create",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "service", entityId: svc!.id, action: "create" },
      })));

    // дубликат имени отклонён
    await owner.postForm("/settings/services", createFrag, {
      name: "E2E Xidmət",
      price: "10",
    });
    const dupCount = await prisma.service.count({
      where: { clinicId: clinic.id, name: "E2E Xidmət" },
    });
    check("дубликат услуги отклонён", dupCount === 1);

    // смена цены — append-only
    svcPage = await owner.get("/settings/services");
    const priceFrag = formFragment(svcPage.html, `data-svc="${svc!.id}"`);
    await owner.postForm("/settings/services", priceFrag, {
      serviceId: svc!.id,
      price: "85",
      childPrice: "",
    });
    const prices = await prisma.price.findMany({
      where: { serviceId: svc!.id },
      orderBy: { createdAt: "asc" },
    });
    check("смена цены: старая закрыта, новая 85.00 текущая (2 записи)",
      prices.length === 2 && prices[0].validTo !== null &&
      prices[1].validTo === null && prices[1].price === 85_00 && prices[1].childPrice === null);
    check("audit: price create",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "price", entityId: prices[1].id },
      })));

    // та же цена повторно → записи прайса не плодятся
    await owner.postForm("/settings/services", priceFrag, {
      serviceId: svc!.id,
      price: "85",
      childPrice: "",
    });
    check("повторная та же цена: новая запись не создана",
      (await prisma.price.count({ where: { serviceId: svc!.id } })) === 2);

    // услуга с текущей ценой видна в форме лечения
    const treatNew = await owner.get("/treatments/new");
    check("услуга доступна в форме müalicə", treatNew.html.includes("E2E Xidmət"));

    // деактивация → из формы лечения исчезает, в прайсе остаётся с бейджем
    const toggleFrag = formFragment(svcPage.html, `data-svc-toggle="${svc!.id}"`);
    await owner.postForm("/settings/services", toggleFrag, { serviceId: svc!.id });
    const svcOff = await prisma.service.findUniqueOrThrow({ where: { id: svc!.id } });
    check("услуга деактивирована", svcOff.isActive === false);
    const treatNew2 = await owner.get("/treatments/new");
    check("деактивированная услуга скрыта из формы müalicə", !treatNew2.html.includes("E2E Xidmət"));
    svcPage = await owner.get("/settings/services");
    check("в прайсе остаётся с бейджем Deaktiv",
      svcPage.html.includes("E2E Xidmət") && svcPage.html.includes("Deaktiv"));

    // ── 7. permissions ──
    const hekimSettings = await hekim.get("/settings");
    check("doctor: /settings read-only (предупреждение)",
      hekimSettings.status === 200 && hekimSettings.html.includes("Yalnız baxış rejimi"));
    await hekim.postForm("/settings", profileFrag, {
      name: "Hacked Klinika", phone: "1", email: "", address: "",
    });
    c = await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
    check("doctor: изменение реквизитов отклонено (нет manage)", c.name === "Demo Klinika");
    await hekim.postForm("/settings/services", priceFrag, {
      serviceId: svc!.id,
      price: "1",
      childPrice: "",
    });
    check("doctor: смена цены отклонена",
      (await prisma.price.count({ where: { serviceId: svc!.id } })) === 2);

    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    const asstSettings = await asst.get("/settings");
    check("assistant: /settings недоступна (нет view)",
      asstSettings.status >= 300 && (asstSettings.location ?? "").includes("/dashboard"));
    await asst.postForm("/settings", paramsFrag, {
      defaultAppointmentMinutes: "5",
      reminderHoursBefore: "1",
    });
    const minutesAsst = await clinicSetting(clinic.id, "default_appointment_minutes");
    check("assistant: изменение параметров отклонено", minutesAsst?.value === 45);

    // ── 8. tenant-изоляция прайса ──
    const clinicB = await prisma.clinic.create({
      data: { name: "E2E Settings B", slug: "e2e-settings-clinic-b", status: "active" },
    });
    const foreignSvc = await prisma.service.create({
      data: { clinicId: clinicB.id, name: "E2E Foreign Xidmət" },
    });
    svcPage = await owner.get("/settings/services");
    check("чужая услуга не видна в прайсе", !svcPage.html.includes("E2E Foreign Xidmət"));
    await owner.postForm("/settings/services", priceFrag, {
      serviceId: foreignSvc.id,
      price: "99",
      childPrice: "",
    });
    check("цена для чужой услуги не создаётся",
      (await prisma.price.count({ where: { serviceId: foreignSvc.id } })) === 0);
    await prisma.service.delete({ where: { id: foreignSvc.id } });
    await prisma.clinic.delete({ where: { id: clinicB.id } });
  } finally {
    // ── восстановление исходного состояния ──
    await prisma.clinic.update({ where: { id: clinic.id }, data: origClinic });
    for (const key of SETTING_KEYS) {
      const orig = origSettings.get(key);
      const current = await clinicSetting(clinic.id, key);
      if (orig === undefined) {
        if (current) await prisma.setting.delete({ where: { id: current.id } });
      } else if (current) {
        await prisma.setting.update({
          where: { id: current.id },
          data: { value: orig === null ? Prisma.JsonNull : orig },
        });
      }
    }
    const e2eSvc = await prisma.service.findMany({
      where: { clinicId: clinic.id, name: { startsWith: "E2E Xidmət" } },
    });
    for (const s of e2eSvc) {
      await prisma.price.deleteMany({ where: { serviceId: s.id } });
      await prisma.service.delete({ where: { id: s.id } });
    }
    if (createdRecordIds.length > 0) {
      await prisma.pdfRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
    }
    for (const f of createdFiles) {
      await fs.rm(path.join(UPLOADS, f), { force: true });
    }
    console.log("\n  (исходные настройки восстановлены, временные данные удалены)");
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
