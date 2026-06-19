/**
 * E2E-проверка Session 42 — Appointment Reminder Scheduling Rules v2:
 *   npx tsx scripts/e2e-appointment-reminder-scheduling-check.ts
 * Требует dev-сервер + seed (demo-klinika). Использует собственные приёмы с
 * фиксированными relative-датами (часы от текущего момента) — не зависит от
 * демо-seed дат (today/tomorrow), которые со временем суток дрейфуют.
 *
 * Покрывает:
 *   A  Reminder window (reminder_hours_before 24 → 48)
 *   B  Due row content (имя/врач/время/badge/WhatsApp-действие)
 *   C  Prepared status (после prepareAppointmentReminder)
 *   D  Response: confirmed
 *   E  Response: running_late
 *   F  Response: reschedule_requested
 *   G  Response: cancelled (не в due-секции)
 *   H  Missing phone (нет WhatsApp-действия)
 *   I  Tenant isolation
 *   J  Permission (accountant без appointments.view)
 */
import { Prisma, PrismaClient } from "@prisma/client";

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

function forms(html: string): string[] {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}
function formContaining(html: string, ...needles: string[]): string {
  return forms(html).find((f) => needles.every((n) => f.includes(n))) ?? "";
}
/**
 * dashboard рендерит несколько панелей с приёмами «на сегодня» (TodayAppointmentsPanel
 * рендерится раньше и тоже может показывать тот же приём как обычную today-строку, без
 * reminder-badge/WhatsApp-формы) — поэтому ищем строку только внутри секции напоминаний,
 * начиная с её заголовка, а не в html целиком.
 */
function remindersSection(html: string): string {
  const idx = html.indexOf("Qəbul xatırlatmaları");
  return idx < 0 ? "" : html.slice(idx);
}

/** Блок <li>…</li> строки панели напоминаний, содержащий needle (имя пациента). */
function rowContaining(html: string, needle: string): string {
  const idx = html.indexOf(needle);
  if (idx < 0) return "";
  const start = html.lastIndexOf("<li", idx);
  const end = html.indexOf("</li>", idx);
  return start < 0 || end < 0 ? "" : html.slice(start, end + 5);
}
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

async function clinicSetting(clinicId: string, key: string) {
  return prisma.setting.findFirst({
    where: { clinicId, scope: "clinic", doctorId: null, userId: null, key },
  });
}

async function main() {
  console.log(`E2E appointment reminder scheduling check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { user: true } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // Cleanup leftovers from previous failed runs
  const oldPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-ARS-" } },
    select: { id: true },
  });
  const oldIds = oldPatients.map((p) => p.id);
  if (oldIds.length > 0) {
    const oldAppts = await prisma.appointment.findMany({ where: { patientId: { in: oldIds } }, select: { id: true } });
    const oldApptIds = oldAppts.map((a) => a.id);
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.notification.deleteMany({ where: { OR: [{ patientId: { in: oldIds } }, { appointmentId: { in: oldApptIds } }] } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.user.deleteMany({ where: { email: "e2e-ars-accountant@e2e.local" } });
  await prisma.clinic.deleteMany({ where: { slug: "e2e-ars-clinic-b" } });

  // исходные значения параметров клиники — восстановить в конце
  const SETTING_KEYS = ["default_appointment_minutes", "reminder_hours_before", "doctor_sees_all_patients"];
  const origSettings = new Map<string, Prisma.JsonValue | undefined>();
  for (const key of SETTING_KEYS) origSettings.set(key, (await clinicSetting(clinic.id, key))?.value);
  const origMinutes = (origSettings.get("default_appointment_minutes") as number | undefined) ?? 30;
  const origSeesAll = origSettings.get("doctor_sees_all_patients") === true;

  console.log("Setup — creating test data…");

  const createPatient = async (suffix: string, phone: string | null = "+994501119900") =>
    prisma.patient.create({
      data: { clinicId: clinic.id, firstName: `E2E-ARS-${suffix}`, lastName: "Test", phone },
    });

  const createAppt = async (patientId: string, hoursFromNow: number) => {
    const startsAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    return prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId,
        doctorId: doctor.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: "scheduled",
        complaint: "e2e-appointment-reminder-scheduling",
        createdById: adminUser.id,
      },
    });
  };

  const setReminderHours = async (owner: Session, hours: number) => {
    const page = await owner.get("/settings");
    const frag = formFragment(page.html, 'name="defaultAppointmentMinutes"');
    const fields: Record<string, string> = {
      defaultAppointmentMinutes: String(origMinutes),
      reminderHoursBefore: String(hours),
    };
    if (origSeesAll) fields.doctorSeesAllPatients = "on";
    await owner.postForm("/settings", frag, fields);
  };

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));

  const accountClinicIds: string[] = [];
  const accountUserIds: string[] = [];

  try {
    // ── A: Reminder window ───────────────────────────────────────────────
    console.log("\nA — reminder window");
    await setReminderHours(owner, 24);
    const hours24 = await clinicSetting(clinic.id, "reminder_hours_before");
    check("A0: reminder_hours_before saved as 24", hours24?.value === 24);

    const patientIn = await createPatient("WinIn");
    const apptIn = await createAppt(patientIn.id, 20); // внутри 24h окна
    const patientOut = await createPatient("WinOut");
    const apptOut = await createAppt(patientOut.id, 30); // вне 24h окна

    const dashA1 = await owner.get("/dashboard");
    check("A1: appointment within 24h window appears as due", dashA1.html.includes("E2E-ARS-WinIn"));
    check("A2: appointment outside 24h window does NOT appear", !dashA1.html.includes("E2E-ARS-WinOut"));

    await setReminderHours(owner, 48);
    const hours48 = await clinicSetting(clinic.id, "reminder_hours_before");
    check("A3: reminder_hours_before saved as 48", hours48?.value === 48);

    const dashA2 = await owner.get("/dashboard");
    check("A4: appointment within 48h window now appears", dashA2.html.includes("E2E-ARS-WinOut"));

    // ── B: Due row content ───────────────────────────────────────────────
    console.log("\nB — due row content");
    const rowB = rowContaining(remindersSection(dashA2.html), "E2E-ARS-WinIn");
    check("B1: due row found", !!rowB);
    check("B2: due row shows doctor name", rowB.includes(doctor.user.fullName));
    check("B3: due row shows time (HH:MM)", /\d{2}:\d{2}/.test(rowB));
    check("B4: due row shows 'Xatırlatma vaxtı çatıb'", rowB.includes("Xatırlatma vaxtı çatıb"));
    check("B5: due row has WhatsApp action form", rowB.includes(`value="${apptIn.id}"`) && rowB.includes("<form"));

    // ── C: Prepared status ───────────────────────────────────────────────
    console.log("\nC — prepared status");
    const reminderForm = formContaining(dashA2.html, "name=\"appointmentId\"", `value="${apptIn.id}"`);
    check("C0: WhatsApp reminder form found for due appointment", !!reminderForm);
    await owner.postForm("/dashboard", reminderForm, { appointmentId: apptIn.id });

    const dashC = await owner.get("/dashboard");
    const rowC = rowContaining(remindersSection(dashC.html), "E2E-ARS-WinIn");
    check("C1: row becomes 'Mesaj hazırlanıb' (prepared)", rowC.includes("Mesaj hazırlanıb"));

    const preparedNotif = await prisma.notification.findFirst({
      where: { appointmentId: apptIn.id, type: "appointment_reminder", channel: "whatsapp" },
    });
    check("C2: communication history row created", !!preparedNotif && preparedNotif.status === "prepared");

    // ── D/E/F/G: response statuses ───────────────────────────────────────
    const anon = new Session();
    const respond = async (
      suffix: string,
      responseType: "confirm" | "running_late" | "reschedule_request" | "cancel",
    ) => {
      const patient = await createPatient(suffix);
      const appt = await createAppt(patient.id, 19 + Math.random()); // в пределах 48h окна
      const dash = await owner.get("/dashboard");
      const form = formContaining(dash.html, 'name="appointmentId"', `value="${appt.id}"`);
      await owner.postForm("/dashboard", form, { appointmentId: appt.id });
      const link = await prisma.patientResponseLink.findFirstOrThrow({ where: { appointmentId: appt.id } });
      const page = await anon.get(`/r/${link.token}`);
      const respForm = formFragment(page.html, "patient-response-form");
      await anon.postForm(`/r/${link.token}`, respForm, { token: link.token, responseType });
      return { patient, appt };
    };

    console.log("\nD — response: confirmed");
    const { patient: patD } = await respond("RespConfirm", "confirm");
    const dashD = await owner.get("/dashboard");
    const rowD = rowContaining(remindersSection(dashD.html), patD.firstName);
    check("D1: row shows 'Təsdiqləyib'", rowD.includes("Təsdiqləyib"));
    check("D2: WhatsApp action no longer offered as primary", !rowD.includes("<form"));

    console.log("\nE — response: running_late");
    const { patient: patE } = await respond("RespLate", "running_late");
    const dashE = await owner.get("/dashboard");
    const rowE = rowContaining(remindersSection(dashE.html), patE.firstName);
    check("E1: row shows 'Gecikə bilər'", rowE.includes("Gecikə bilər"));

    console.log("\nF — response: reschedule_requested");
    const { patient: patF } = await respond("RespResched", "reschedule_request");
    const dashF = await owner.get("/dashboard");
    const rowF = rowContaining(remindersSection(dashF.html), patF.firstName);
    check("F1: row shows 'Vaxt dəyişmək istəyir'", rowF.includes("Vaxt dəyişmək istəyir"));

    console.log("\nG — response: cancelled");
    const { patient: patG, appt: apptG } = await respond("RespCancel", "cancel");
    const dashG = await owner.get("/dashboard");
    const rowG = rowContaining(remindersSection(dashG.html), patG.firstName);
    check("G1: row shows 'Ləğv edib', not due badge", rowG.includes("Ləğv edib") && !rowG.includes("Xatırlatma vaxtı çatıb"));
    const apptGAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptG.id } });
    check("G2: appointment status = cancelled", apptGAfter.status === "cancelled");

    // ── H: Missing phone ─────────────────────────────────────────────────
    console.log("\nH — missing phone");
    const patientNoPhone = await createPatient("NoPhone", null);
    await createAppt(patientNoPhone.id, 21);
    const dashH = await owner.get("/dashboard");
    const rowH = rowContaining(remindersSection(dashH.html), "E2E-ARS-NoPhone");
    check("H1: row visible despite missing phone", !!rowH);
    check("H2: row has no WhatsApp action form", !rowH.includes("<form"));
    check("H3: row shows missing-phone label", rowH.includes("Telefon nömrəsi yoxdur"));

    // ── I: Tenant isolation ───────────────────────────────────────────────
    console.log("\nI — tenant isolation");
    const clinicB = await prisma.clinic.create({
      data: { name: "E2E ARS B", slug: "e2e-ars-clinic-b", status: "active" },
    });
    accountClinicIds.push(clinicB.id);
    const roleB = await prisma.role.findFirstOrThrow({ where: { key: "doctor", clinicId: null } });
    const userB = await prisma.user.create({
      data: {
        email: "e2e-ars-doctor-b@e2e.local",
        fullName: "E2E ARS B Doctor",
        clinicId: clinicB.id,
        roleId: roleB.id,
        passwordHash: "x",
      },
    });
    accountUserIds.push(userB.id);
    const doctorB = await prisma.doctor.create({ data: { clinicId: clinicB.id, userId: userB.id } });
    const patientB = await prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: "E2E-ARS-Foreign", lastName: "B", phone: "+994501119911" },
    });
    await prisma.appointment.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientB.id,
        doctorId: doctorB.id,
        startsAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 5.5 * 60 * 60 * 1000),
        status: "scheduled",
        createdById: userB.id,
      },
    });

    const dashI = await owner.get("/dashboard");
    check("I1: clinic A dashboard does not show clinic B's patient", !dashI.html.includes("E2E-ARS-Foreign"));

    // ── J: Permission ─────────────────────────────────────────────────────
    console.log("\nJ — permission (accountant without appointments.view)");
    const accountantRole = await prisma.role.findFirstOrThrow({ where: { key: "accountant", clinicId: null } });
    const accountantUser = await prisma.user.create({
      data: {
        email: "e2e-ars-accountant@e2e.local",
        fullName: "E2E ARS Accountant",
        clinicId: clinic.id,
        roleId: accountantRole.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(accountantUser.id);
    const accSession = new Session();
    check("J0: accountant login", await accSession.login("e2e-ars-accountant@e2e.local"));
    const dashJ = await accSession.get("/dashboard");
    check("J1: dashboard opens for accountant", dashJ.status === 200);
    check("J2: accountant does not see 'Qəbul xatırlatmaları' panel", !dashJ.html.includes("Qəbul xatırlatmaları"));

    // ── Regression smoke: existing pages still open ───────────────────────
    check("/dashboard (owner) opens", dashG.status === 200);
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    console.log("\nCleanup…");
    const allTestPatients = await prisma.patient.findMany({
      where: { clinicId: clinic.id, firstName: { startsWith: "E2E-ARS-" } },
      select: { id: true },
    });
    const allTestIds = allTestPatients.map((p) => p.id);
    const allTestAppts = await prisma.appointment.findMany({ where: { patientId: { in: allTestIds } }, select: { id: true } });
    const allTestApptIds = allTestAppts.map((a) => a.id);
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.notification.deleteMany({ where: { OR: [{ patientId: { in: allTestIds } }, { appointmentId: { in: allTestApptIds } }] } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: allTestIds } } });

    await prisma.appointment.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.patient.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.doctor.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.user.deleteMany({ where: { id: { in: accountUserIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: accountClinicIds } } });

    // восстановление исходных параметров клиники
    for (const key of SETTING_KEYS) {
      const orig = origSettings.get(key);
      const current = await clinicSetting(clinic.id, key);
      if (orig === undefined) {
        if (current) await prisma.setting.delete({ where: { id: current.id } });
      } else if (current && JSON.stringify(current.value) !== JSON.stringify(orig)) {
        await prisma.setting.update({ where: { id: current.id }, data: { value: orig as Prisma.InputJsonValue } });
      }
    }
    console.log("  (временные данные e2e удалены, настройки клиники восстановлены)");
  }

  console.log("\n────────────────────────────────────────────");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
