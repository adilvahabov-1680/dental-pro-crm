/**
 * E2E-проверка модуля Qəbullar (dev-скрипт):
 *   npx tsx scripts/e2e-appointments-check.ts
 * Требует dev-сервер + seed. Техника: HTTP + cookie-jar + progressive-
 * enhancement формы server actions (как e2e-patients/dental-chart).
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
    return {
      status: res.status,
      html: res.status < 300 ? await res.text() : "",
      location: res.headers.get("location") ?? undefined,
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

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  console.log(`E2E appointments check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id } });

  // очистка тестовых приёмов прошлых прогонов
  await prisma.appointment.deleteMany({ where: { notes: { startsWith: "e2e-" } } });

  // 1. seed demo appointments существуют
  const demoCount = await prisma.appointment.count({
    where: { clinicId: clinic.id, notes: { startsWith: "demo-seed" } },
  });
  check("seed: demo-приёмы созданы (3)", demoCount === 3, `got ${demoCount}`);

  // 2. страница /appointments (owner, день)
  const owner = new Session();
  check("login owner", await owner.login("admin@demo.dentalpro.az"));
  const page = await owner.get("/appointments");
  check("страница приёмов: demo-приём Rəşad'а виден", page.html.includes("Həsənov"));
  check("вкладки Gün/Həftə/Siyahı", page.html.includes("Həftə") && page.html.includes("Siyahı"));
  check("ссылка на diş xəritəsi с карточки", page.html.includes(`/patients/${resad.id}/dental-chart`));

  // 3. создание приёма владельцем (Tural, завтра 09:00)
  const newPage = await owner.get(`/appointments/new?patient=${tural.id}`);
  check("форма Yeni qəbul с преселектом пациента", newPage.html.includes("Tural"));
  const created = await owner.postForm(`/appointments/new?patient=${tural.id}`, newPage.html, {
    patientId: tural.id,
    doctorId: doctor.id,
    date: dateStr(1),
    time: "09:00",
    durationMin: "30",
    complaint: "e2e-yoxlama",
    notes: "e2e-create",
  });
  check("createAppointment → 303 на день приёма", created.status === 303, `got ${created.status}`);
  const createdDb = await prisma.appointment.findFirst({ where: { notes: "e2e-create" } });
  check("приём в БД (Tural, врач Elvin)", createdDb?.patientId === tural.id && createdDb?.doctorId === doctor.id);
  const auditCreate = await prisma.auditLog.findFirst({
    where: { entityType: "appointment", entityId: createdDb?.id ?? "", action: "create" },
  });
  check("audit_log: create записан", !!auditCreate);

  // 4. overlap блокируется (то же время того же врача)
  const before = await prisma.appointment.count({ where: { clinicId: clinic.id } });
  const overlap = await owner.postForm(`/appointments/new`, newPage.html, {
    patientId: resad.id,
    doctorId: doctor.id,
    date: dateStr(1),
    time: "09:15",
    durationMin: "30",
    notes: "e2e-overlap",
  });
  const after = await prisma.appointment.count({ where: { clinicId: clinic.id } });
  check("overlap: запись не создана", overlap.status !== 303 || before === after);
  const overlapDb = await prisma.appointment.findFirst({ where: { notes: "e2e-overlap" } });
  check("overlap: в БД нет пересечения", overlapDb === null);

  // 5. смена статуса (owner, day view завтрашнего дня)
  const dayPage = await owner.get(`/appointments?date=${dateStr(1)}`);
  check("day view содержит созданный приём", dayPage.html.includes("e2e-yoxlama"));
  await owner.postForm(`/appointments?date=${dateStr(1)}`, dayPage.html, {
    appointmentId: createdDb!.id,
    status: "confirmed",
  });
  const confirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: createdDb!.id } });
  check("статус обновился (confirmed)", confirmed.status === "confirmed");

  // 6. невалидные id блокируются
  const fakeUuid = "00000000-0000-4000-8000-000000000999";
  await owner.postForm(`/appointments/new`, newPage.html, {
    patientId: fakeUuid,
    doctorId: doctor.id,
    date: dateStr(2),
    time: "10:00",
    durationMin: "30",
    notes: "e2e-bad-patient",
  });
  check("чужой/несуществующий patientId блокируется",
    (await prisma.appointment.findFirst({ where: { notes: "e2e-bad-patient" } })) === null);
  await owner.postForm(`/appointments/new`, newPage.html, {
    patientId: resad.id,
    doctorId: fakeUuid,
    date: dateStr(2),
    time: "10:00",
    durationMin: "30",
    notes: "e2e-bad-doctor",
  });
  check("несуществующий doctorId блокируется",
    (await prisma.appointment.findFirst({ where: { notes: "e2e-bad-doctor" } })) === null);

  // 7. doctor scope: второй (временный) врач — его приём невидим первому
  const doc2User = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: (await prisma.role.findFirstOrThrow({ where: { key: "doctor", clinicId: null } })).id,
      email: "e2e-doc2@demo.dentalpro.az",
      fullName: "Dr. E2E İkinci",
      passwordHash: "x",
    },
  });
  const doc2 = await prisma.doctor.create({
    data: { clinicId: clinic.id, userId: doc2User.id, color: "#888888" },
  });
  const d2start = new Date();
  d2start.setDate(d2start.getDate() + 1);
  d2start.setHours(13, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: tural.id,
      doctorId: doc2.id,
      startsAt: d2start,
      endsAt: new Date(d2start.getTime() + 30 * 60_000),
      complaint: "e2e-doc2-appt",
      notes: "e2e-doc2",
      createdById: doc2User.id,
    },
  });

  const hekim = new Session();
  check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
  const hekimDay = await hekim.get(`/appointments?date=${dateStr(1)}`);
  check("doctor видит свой приём", hekimDay.html.includes("e2e-yoxlama") || hekimDay.html.includes("Tural"));
  check("doctor НЕ видит приём другого врача", !hekimDay.html.includes("e2e-doc2-appt"));
  // и не может создать приём чужому пациенту... Tural теперь имеет приём у Elvin —
  // но primaryDoctor у Tural отсутствует → вне scope врача:
  const hekimNew = await hekim.get("/appointments/new");
  check("doctor: чужой пациент (Tural) отсутствует в select", !hekimNew.html.includes("Tural"));

  // 8. assistant: видит приёмы своего врача, но без manage
  const asst = new Session();
  check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
  const asstDay = await asst.get(`/appointments?date=${dateStr(1)}`);
  check("assistant видит приёмы прикреплённого врача", asstDay.html.includes("e2e-yoxlama"));
  check("assistant: контрола статуса нет (read-only)", !asstDay.html.includes('name="appointmentId"'));
  check("assistant: кнопки Yeni qəbul нет", !asstDay.html.includes('href="/appointments/new"'));
  await asst.postForm(`/appointments?date=${dateStr(1)}`, dayPage.html, {
    appointmentId: createdDb!.id,
    status: "cancelled",
  });
  const stillConfirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: createdDb!.id } });
  check("assistant: POST смены статуса отклонён", stillConfirmed.status === "confirmed");

  // 9. карточка пациента: блок Qəbullar + Son ziyarət
  const patientPage = await owner.get(`/patients/${resad.id}`);
  check("карточка пациента: блок Qəbullar с приёмами",
    patientPage.html.includes("Növbəti qəbul") || patientPage.html.includes("Son qəbullar"));
  check("кнопка Yeni qəbul ведёт на форму с пациентом",
    patientPage.html.includes(`/appointments/new?patient=${resad.id}`));
  const listPage = await owner.get(`/patients?q=${encodeURIComponent("Rəşad")}`);
  check("список пациентов рендерится с Rəşad'ом", listPage.html.includes("Həsənov"));
  // Son ziyarət: дата вчерашнего completed-приёма есть в строке
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  check(`Son ziyarət показывает дату (${yStr})`, listPage.html.includes(yStr));

  // cleanup временного врача и его приёмов
  await prisma.appointment.deleteMany({ where: { notes: "e2e-doc2" } });
  await prisma.doctor.delete({ where: { id: doc2.id } });
  await prisma.user.delete({ where: { id: doc2User.id } });
  console.log("\n  (временный врач e2e удалён)");

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
