/**
 * E2E-проверка модуля Müalicə (dev-скрипт):
 *   npx tsx scripts/e2e-treatments-check.ts
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

async function main() {
  console.log(`E2E treatments check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });
  const svcNoPrice = await prisma.service.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Konsultasiya" },
  });
  const svcPriced = await prisma.service.findFirstOrThrow({
    where: { clinicId: clinic.id, name: "Profilaktik təmizlik" },
  });

  // очистка прошлых e2e-прогонов
  await prisma.treatmentItem.deleteMany({ where: { notes: { startsWith: "e2e-" } } });

  // 1. seed: план + 3 items
  const plan = await prisma.treatmentPlan.findFirst({
    where: { clinicId: clinic.id, title: "Rəşad — ilkin müalicə planı" },
  });
  const seedItems = await prisma.treatmentItem.count({
    where: { clinicId: clinic.id, notes: { startsWith: "demo-seed:" } },
  });
  check("seed: план лечения создан", !!plan);
  // 3 в плане (16/36/46) + 1 свободная для finance-модуля (Profilaktik free)
  check("seed: 4 demo-процедуры", seedItems === 4, `got ${seedItems}`);
  check(
    "seed: totalPrice плана = 320 AZN (80+90+150)",
    plan?.totalPrice === 320_00,
    `got ${plan?.totalPrice}`,
  );

  // 2. /treatments (owner)
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const listPage = await owner.get("/treatments");
  check("/treatments: процедуры Rəşad'а видны", listPage.html.includes("Kanal müalicəsi"));

  // 3-4. блок на пациенте + страница лечения пациента
  const patientPage = await owner.get(`/patients/${resad.id}`);
  check("карточка пациента: блок Müalicə с планом",
    patientPage.html.includes("ilkin müalicə planı"));
  const ptPage = await owner.get(`/patients/${resad.id}/treatments`);
  check("страница лечения пациента открывается",
    ptPage.html.includes("Kariyes müalicəsi") && ptPage.html.includes("ilkin müalicə planı"));

  // 8-9. создание с tooth из query (форма с зубной карты)
  const formTooth = await owner.get(`/patients/${resad.id}/treatments/new?tooth=11`);
  check(
    "форма: tooth=11 преселект",
    /<option[^>]*value="11"[^>]*selected/.test(formTooth.html) ||
      /<option[^>]*selected[^>]*value="11"/.test(formTooth.html),
  );
  const createdTooth = await owner.postForm(
    `/patients/${resad.id}/treatments/new?tooth=11`,
    formTooth.html,
    {
      patientId: resad.id,
      doctorId: doctor.id,
      serviceId: svcPriced.id,
      toothNumber: "11",
      status: "planned",
      price: "50",
      notes: "e2e-tooth",
    },
  );
  check("создание с зубом → 303", createdTooth.status === 303, `got ${createdTooth.status}`);
  const itemTooth = await prisma.treatmentItem.findFirst({ where: { notes: "e2e-tooth" } });
  check("item: toothNumber=11, toothRecordId связан, цена 50 AZN",
    itemTooth?.toothNumber === 11 && itemTooth?.toothRecordId !== null && itemTooth?.price === 50_00);
  const auditCreate = await prisma.auditLog.findFirst({
    where: { entityType: "treatment_item", entityId: itemTooth?.id ?? "", action: "create" },
  });
  check("audit_log: create записан", !!auditCreate);

  // 10. создание с appointmentId
  const appt = await prisma.appointment.findFirstOrThrow({
    where: { clinicId: clinic.id, patientId: resad.id },
  });
  await owner.postForm(`/patients/${resad.id}/treatments/new`, formTooth.html, {
    patientId: resad.id,
    doctorId: doctor.id,
    serviceId: svcNoPrice.id,
    appointmentId: appt.id,
    status: "done",
    price: "25,50", // запятая + услуга без прайса (fallback ручного ввода)
    notes: "e2e-appt",
  });
  const itemAppt = await prisma.treatmentItem.findFirst({ where: { notes: "e2e-appt" } });
  check("item привязан к приёму", itemAppt?.appointmentId === appt.id);
  check("цена без прайса: ручной ввод 25,50 → 2550 qəpik", itemAppt?.price === 25_50);
  check("status done без даты → performedAt = now", itemAppt?.performedAt !== null);

  // 11-13. невалидные id
  const fake = "00000000-0000-4000-8000-000000000999";
  await owner.postForm(`/treatments/new`, (await owner.get("/treatments/new")).html, {
    patientId: fake,
    doctorId: doctor.id,
    serviceId: svcPriced.id,
    status: "planned",
    price: "10",
    notes: "e2e-bad-patient",
  });
  check("чужой patientId блокирован",
    (await prisma.treatmentItem.findFirst({ where: { notes: "e2e-bad-patient" } })) === null);
  await owner.postForm(`/patients/${resad.id}/treatments/new`, formTooth.html, {
    patientId: resad.id,
    doctorId: fake,
    serviceId: svcPriced.id,
    status: "planned",
    price: "10",
    notes: "e2e-bad-doctor",
  });
  check("несуществующий doctorId блокирован",
    (await prisma.treatmentItem.findFirst({ where: { notes: "e2e-bad-doctor" } })) === null);
  // чужой appointmentId (приём Tural'а ≠ пациенту Rəşad)
  const turalAppt = await prisma.appointment.findFirst({
    where: { clinicId: clinic.id, patientId: tural.id },
  });
  if (turalAppt) {
    await owner.postForm(`/patients/${resad.id}/treatments/new`, formTooth.html, {
      patientId: resad.id,
      doctorId: doctor.id,
      serviceId: svcPriced.id,
      appointmentId: turalAppt.id,
      status: "planned",
      price: "10",
      notes: "e2e-bad-appt",
    });
    check("чужой appointmentId блокирован",
      (await prisma.treatmentItem.findFirst({ where: { notes: "e2e-bad-appt" } })) === null);
  } else {
    check("чужой appointmentId блокирован (нет приёма Tural — skip)", true);
  }

  // 15+17. смена статуса → cancelled исключается из суммы плана
  const item46 = await prisma.treatmentItem.findFirstOrThrow({
    where: { notes: "demo-seed:Kanal müalicəsi:46" },
  });
  await owner.postForm(`/patients/${resad.id}/treatments`, ptPage.html, {
    treatmentItemId: item46.id,
    status: "cancelled",
  });
  const planAfterCancel = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan!.id } });
  check(
    "cancelled исключён из totalPrice плана (320→170)",
    planAfterCancel.totalPrice === 170_00,
    `got ${planAfterCancel.totalPrice}`,
  );
  const auditUpd = await prisma.auditLog.findFirst({
    where: { entityType: "treatment_item", entityId: item46.id, action: "update" },
  });
  check("audit_log: update статуса записан", !!auditUpd);
  // вернуть и проверить пересчёт обратно (16. done ставит performedAt)
  await owner.postForm(`/patients/${resad.id}/treatments`, ptPage.html, {
    treatmentItemId: item46.id,
    status: "done",
  });
  const item46Done = await prisma.treatmentItem.findUniqueOrThrow({ where: { id: item46.id } });
  check("done без даты → performedAt установлен", item46Done.performedAt !== null);
  const planRestored = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan!.id } });
  check("totalPrice пересчитан обратно (320)", planRestored.totalPrice === 320_00);
  // вернуть seed-состояние
  await prisma.treatmentItem.update({
    where: { id: item46.id },
    data: { status: "in_progress", performedAt: null },
  });

  // 18-19. ссылки из карты и приёма
  const chartPage = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
  check("панель зуба: ссылка Yeni müalicə с tooth",
    chartPage.html.includes(`/patients/${resad.id}/treatments/new?tooth=16`));
  check("панель зуба: последние процедуры видны", chartPage.html.includes("Kariyes müalicəsi"));
  const apptPage = await owner.get("/appointments");
  check("карточка приёма: ссылка Müalicə əlavə et с appointmentId",
    apptPage.html.includes(`/treatments/new?appointmentId=`));

  // 5-6. doctor scope
  const hekim = new Session();
  check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
  const hekimList = await hekim.get("/treatments");
  check("doctor видит лечение своих пациентов", hekimList.html.includes("Kariyes müalicəsi"));
  const hekimForeign = await hekim.get(`/patients/${tural.id}/treatments`);
  check("doctor: лечение чужого пациента → 404/нет утечки",
    hekimForeign.status === 404 || !hekimForeign.html.includes("Tural"));

  // 7. assistant: read-only, создание недоступно
  const asst = new Session();
  check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
  const asstList = await asst.get("/treatments");
  check("assistant видит лечение (view)", asstList.html.includes("Kariyes müalicəsi"));
  check("assistant: контрола статуса нет", !asstList.html.includes('name="treatmentItemId"'));
  const before = await prisma.treatmentItem.count({ where: { notes: "e2e-asst" } });
  await asst.postForm(`/patients/${resad.id}/treatments/new`, formTooth.html, {
    patientId: resad.id,
    doctorId: doctor.id,
    serviceId: svcPriced.id,
    status: "planned",
    price: "10",
    notes: "e2e-asst",
  });
  const after = await prisma.treatmentItem.count({ where: { notes: "e2e-asst" } });
  check("assistant: POST create отклонён", before === after && after === 0);

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
