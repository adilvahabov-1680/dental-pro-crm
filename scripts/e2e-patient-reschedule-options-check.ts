/**
 * E2E-проверка Session 43 — Patient Reschedule Options Flow v1:
 *   npx tsx scripts/e2e-patient-reschedule-options-check.ts
 * Требует dev-сервер + seed (demo-klinika). Создаёт собственные приёмы с
 * фиксированными relative-датами (часы от текущего момента) — не зависит от
 * демо-seed дат.
 *
 * Покрывает:
 *   A  Initial reschedule request (/r/[token] → reschedule_requested)
 *   B  Staff creates 2–3 options → link + WhatsApp message + history
 *   C  Validation (too few / past / duplicate; max 3 enforced by form shape)
 *   D  Public options page (no login, no leak, expired/used/invalid)
 *   E  Patient selects option → appointment moves, status, history, notif
 *   F  Token safety (single-use, invalid token, cross-tenant)
 *   G  Permission (no appointments.manage → cannot create options link)
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

function forms(html: string): string[] {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}
function formContaining(html: string, ...needles: string[]): string {
  return forms(html).find((f) => needles.every((n) => f.includes(n))) ?? "";
}
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

/** Локальная дата/время (как сервер парсит `${date}T${time}:00`, без UTC-сдвига). */
function toDateTimeFields(d: Date): { date: string; time: string } {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
}

async function main() {
  console.log(`E2E patient reschedule options check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { user: true } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // Cleanup leftovers from previous failed runs
  const oldPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-PRO-" } },
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
  await prisma.user.deleteMany({ where: { email: { in: ["e2e-pro-owner-b@e2e.local", "e2e-pro-assistant@e2e.local"] } } });
  await prisma.clinic.deleteMany({ where: { slug: "e2e-pro-clinic-b" } });

  const createPatient = async (suffix: string) =>
    prisma.patient.create({
      data: { clinicId: clinic.id, firstName: `E2E-PRO-${suffix}`, lastName: "Test", phone: "+994501119800" },
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
        complaint: "e2e-patient-reschedule-options",
        createdById: adminUser.id,
      },
    });
  };

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));
  const anon = new Session();

  /** /r/[token] (confirm_appointment) → reschedule_request, приём переходит в reschedule_requested. */
  const requestReschedule = async (patientId: string, apptId: string) => {
    const page = await owner.get(`/patients/${patientId}`);
    const form = formContaining(page.html, 'name="appointmentId"', `value="${apptId}"`);
    await owner.postForm(`/patients/${patientId}`, form, { appointmentId: apptId });
    const link = await prisma.patientResponseLink.findFirstOrThrow({
      where: { appointmentId: apptId, purpose: "confirm_appointment" },
      orderBy: { createdAt: "desc" },
    });
    const respPage = await anon.get(`/r/${link.token}`);
    const respForm = formFragment(respPage.html, "patient-response-form");
    await anon.postForm(`/r/${link.token}`, respForm, { token: link.token, responseType: "reschedule_request" });
  };

  const accountClinicIds: string[] = [];
  const accountUserIds: string[] = [];

  try {
    // ── A: Initial reschedule request ───────────────────────────────────
    console.log("\nA — initial reschedule request");
    const patientMain = await createPatient("Main");
    const apptMain = await createAppt(patientMain.id, 30);
    await requestReschedule(patientMain.id, apptMain.id);

    const apptMainAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptMain.id } });
    check("A1: appointment status = reschedule_requested", apptMainAfter.status === "reschedule_requested", `got ${apptMainAfter.status}`);

    // ── B: Staff creates options ──────────────────────────────────────────
    console.log("\nB — staff creates options");
    // секунды/мс обнуляем сразу — сервер парсит `${date}T${time}:00` (минутная точность)
    const opt1 = new Date(Date.now() + 48 * 60 * 60 * 1000);
    opt1.setSeconds(0, 0);
    const opt2 = new Date(Date.now() + 72 * 60 * 60 * 1000);
    opt2.setSeconds(0, 0);
    const f1 = toDateTimeFields(opt1);
    const f2 = toDateTimeFields(opt2);

    const patientPageMain = await owner.get(`/patients/${patientMain.id}`);
    check("B0: reschedule-options-block visible for reschedule_requested appointment",
      patientPageMain.html.includes("reschedule-options-block"));
    const optionsForm = formContaining(patientPageMain.html, "reschedule-options-form", `value="${apptMain.id}"`);
    check("B1: reschedule options form found", !!optionsForm);

    await owner.postForm(`/patients/${patientMain.id}`, optionsForm, {
      appointmentId: apptMain.id,
      option1Date: f1.date,
      option1Time: f1.time,
      option2Date: f2.date,
      option2Time: f2.time,
    });

    const offerLink = await prisma.patientResponseLink.findFirstOrThrow({
      where: { appointmentId: apptMain.id, purpose: "reschedule_offer" },
      orderBy: { createdAt: "desc" },
    });
    check("B2: reschedule_offer link created, status=active", offerLink.status === "active");
    const storedOptions = (offerLink.response as { kind?: string; options?: Array<{ id: string; startsAt: string }> } | null);
    check("B3: exactly 2 options stored", storedOptions?.kind === "options" && storedOptions.options?.length === 2,
      `got ${JSON.stringify(storedOptions)}`);
    check("B4: option 1 startsAt matches submitted value",
      !!storedOptions?.options && new Date(storedOptions.options[0].startsAt).getTime() === new Date(`${f1.date}T${f1.time}:00`).getTime());

    const offerNotif = await prisma.notification.findFirst({
      where: { appointmentId: apptMain.id, type: "reschedule_offer", channel: "whatsapp" },
      orderBy: { createdAt: "desc" },
    });
    check("B5: WhatsApp message includes options link", !!offerNotif && offerNotif.body.includes(`/r/${offerLink.token}`));
    check("B6: communication history row status=prepared", offerNotif?.status === "prepared");

    // ── C: Validation ──────────────────────────────────────────────────────
    console.log("\nC — validation");
    const patientVal = await createPatient("Val");
    const apptVal = await createAppt(patientVal.id, 31);
    await requestReschedule(patientVal.id, apptVal.id);

    const pageVal = await owner.get(`/patients/${patientVal.id}`);
    const formVal = formContaining(pageVal.html, "reschedule-options-form", `value="${apptVal.id}"`);

    // too few (option2 left empty)
    const futureA = toDateTimeFields(new Date(Date.now() + 40 * 60 * 60 * 1000));
    await owner.postForm(`/patients/${patientVal.id}`, formVal, {
      appointmentId: apptVal.id,
      option1Date: futureA.date,
      option1Time: futureA.time,
      option2Date: "",
      option2Time: "",
    });
    let countVal = await prisma.patientResponseLink.count({ where: { appointmentId: apptVal.id, purpose: "reschedule_offer" } });
    check("C1: less than 2 options rejected (no link created)", countVal === 0, `count=${countVal}`);

    // past option
    const pastA = toDateTimeFields(new Date(Date.now() - 2 * 60 * 60 * 1000));
    await owner.postForm(`/patients/${patientVal.id}`, formVal, {
      appointmentId: apptVal.id,
      option1Date: pastA.date,
      option1Time: pastA.time,
      option2Date: futureA.date,
      option2Time: futureA.time,
    });
    countVal = await prisma.patientResponseLink.count({ where: { appointmentId: apptVal.id, purpose: "reschedule_offer" } });
    check("C2: past option rejected (no link created)", countVal === 0, `count=${countVal}`);

    // duplicate options
    await owner.postForm(`/patients/${patientVal.id}`, formVal, {
      appointmentId: apptVal.id,
      option1Date: futureA.date,
      option1Time: futureA.time,
      option2Date: futureA.date,
      option2Time: futureA.time,
    });
    countVal = await prisma.patientResponseLink.count({ where: { appointmentId: apptVal.id, purpose: "reschedule_offer" } });
    check("C3: duplicate options rejected (no link created)", countVal === 0, `count=${countVal}`);

    // max 3 enforced by form shape: extra option4* fields are simply ignored
    const futureB = toDateTimeFields(new Date(Date.now() + 50 * 60 * 60 * 1000));
    const futureC = toDateTimeFields(new Date(Date.now() + 60 * 60 * 60 * 1000));
    const futureD = toDateTimeFields(new Date(Date.now() + 80 * 60 * 60 * 1000));
    await owner.postForm(`/patients/${patientVal.id}`, formVal, {
      appointmentId: apptVal.id,
      option1Date: futureA.date,
      option1Time: futureA.time,
      option2Date: futureB.date,
      option2Time: futureB.time,
      option3Date: futureC.date,
      option3Time: futureC.time,
      option4Date: futureD.date,
      option4Time: futureD.time,
    });
    const offerLinkVal = await prisma.patientResponseLink.findFirstOrThrow({
      where: { appointmentId: apptVal.id, purpose: "reschedule_offer" },
    });
    const storedVal = offerLinkVal.response as { options?: unknown[] } | null;
    check("C4: max 3 options enforced (4th field ignored)", storedVal?.options?.length === 3, `got ${JSON.stringify(storedVal)}`);

    // ── D: Public options page ──────────────────────────────────────────
    console.log("\nD — public options page");
    const optPage = await anon.get(`/r/${offerLink.token}`);
    check("D1: public page opens without login (200)", optPage.status === 200, `status=${optPage.status}`);
    check("D2: shows only the 2 proposed options", [...optPage.html.matchAll(/reschedule-option-\d/g)].length === 2,
      `matches=${[...optPage.html.matchAll(/reschedule-option-\d/g)].length}`);
    check("D3: shows option times", optPage.html.includes(fmtTime(opt1)) && optPage.html.includes(fmtTime(opt2)));
    check("D4: does NOT leak internal ids", !optPage.html.includes(apptMain.id) && !optPage.html.includes(patientMain.id) && !optPage.html.includes(offerLink.id));

    const invalidPage = await anon.get(`/r/this-reschedule-token-does-not-exist-xyz`);
    check("D5: invalid token → 200 graceful", invalidPage.status === 200, `status=${invalidPage.status}`);
    check("D6: invalid token shows generic expired/not-found message", invalidPage.html.includes("Linkin müddəti bitib"));

    const patientExp = await createPatient("Expired");
    const apptExp = await createAppt(patientExp.id, 5);
    const expiredLink = await prisma.patientResponseLink.create({
      data: {
        clinicId: clinic.id,
        patientId: patientExp.id,
        appointmentId: apptExp.id,
        token: "e2e-pro-expired-token-" + Math.random().toString(36).slice(2),
        purpose: "reschedule_offer",
        status: "active",
        expiresAt: new Date(Date.now() - 60_000),
        response: { kind: "options", options: [{ id: "1", startsAt: opt1.toISOString(), endsAt: opt1.toISOString() }] },
      },
    });
    const expiredPage = await anon.get(`/r/${expiredLink.token}`);
    check("D7: expired reschedule_offer token shows generic expired message", expiredPage.html.includes("Linkin müddəti bitib"));

    // ── E: Patient selects option ────────────────────────────────────────
    console.log("\nE — patient selects option");
    const selectPage = await anon.get(`/r/${offerLink.token}`);
    const selectForm = formContaining(selectPage.html, "reschedule-options-select-form");
    check("E0: selection form found", !!selectForm);
    const selectRes = await anon.postForm(`/r/${offerLink.token}`, selectForm, { token: offerLink.token, optionId: "1" });
    check("E1: select submit responds ok", selectRes.status === 200, `status=${selectRes.status}`);

    const apptMainAfterSelect = await prisma.appointment.findUniqueOrThrow({ where: { id: apptMain.id } });
    check("E2: appointment startsAt updated to option 1", apptMainAfterSelect.startsAt.getTime() === opt1.getTime(),
      `got ${apptMainAfterSelect.startsAt.toISOString()}`);
    check("E3: appointment status = scheduled", apptMainAfterSelect.status === "scheduled", `got ${apptMainAfterSelect.status}`);
    check("E4: patientResponseStatus reset to pending", apptMainAfterSelect.patientResponseStatus === "pending");

    const offerLinkAfter = await prisma.patientResponseLink.findUniqueOrThrow({ where: { id: offerLink.id } });
    check("E5: link status = used", offerLinkAfter.status === "used");
    const selectedResponse = offerLinkAfter.response as { kind?: string; previousStartsAt?: string; newStartsAt?: string } | null;
    check("E6: response logs old → new time", selectedResponse?.kind === "selected" && !!selectedResponse.previousStartsAt && !!selectedResponse.newStartsAt);

    const patientLogE = await prisma.notification.findFirst({
      where: { patientId: patientMain.id, appointmentId: apptMain.id, channel: "other", type: "reschedule_offer" },
      orderBy: { createdAt: "desc" },
    });
    check("E7: patient communication history row created", !!patientLogE);

    const staffNotifE = await prisma.notification.findFirst({
      where: { appointmentId: apptMain.id, channel: "in_app", type: "reschedule_offer" },
    });
    check("E8: staff notification created", !!staffNotifE && staffNotifE.body.includes("E2E-PRO-Main"));

    const ownerNotifPage = await owner.get("/notifications");
    check("E9: staff notification visible in bell/notifications UI",
      !!staffNotifE && ownerNotifPage.html.includes(staffNotifE.body));

    // ── F: Token safety ───────────────────────────────────────────────────
    console.log("\nF — token safety");
    const replayRes = await anon.postForm(`/r/${offerLink.token}`, selectForm, { token: offerLink.token, optionId: "2" });
    check("F1: second submit on used token responds ok (rejected gracefully)", replayRes.status === 200);
    const apptMainStill = await prisma.appointment.findUniqueOrThrow({ where: { id: apptMain.id } });
    check("F2: appointment unchanged after replay (still option 1's time)", apptMainStill.startsAt.getTime() === opt1.getTime());

    const garbageRes = await anon.postForm(`/r/totally-invalid-reschedule-token-000`, selectForm, {
      token: "totally-invalid-reschedule-token-000",
      optionId: "1",
    });
    check("F3: submit with invalid token responds ok (no crash)", garbageRes.status === 200, `status=${garbageRes.status}`);

    // cross-tenant: clinic B owner cannot create options for clinic A's appointment
    const patientPerm = await createPatient("Perm");
    const apptPerm = await createAppt(patientPerm.id, 32);
    await requestReschedule(patientPerm.id, apptPerm.id);
    const pagePerm = await owner.get(`/patients/${patientPerm.id}`);
    const formPerm = formContaining(pagePerm.html, "reschedule-options-form", `value="${apptPerm.id}"`);

    const clinicB = await prisma.clinic.create({ data: { name: "E2E PRO B", slug: "e2e-pro-clinic-b", status: "active" } });
    accountClinicIds.push(clinicB.id);
    const ownerRoleB = await prisma.role.findFirstOrThrow({ where: { key: "owner", clinicId: null } });
    const userB = await prisma.user.create({
      data: {
        email: "e2e-pro-owner-b@e2e.local",
        fullName: "E2E PRO B Owner",
        clinicId: clinicB.id,
        roleId: ownerRoleB.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(userB.id);
    const sessionB = new Session();
    check("F4: clinic B owner login", await sessionB.login("e2e-pro-owner-b@e2e.local"));

    const futureF = toDateTimeFields(new Date(Date.now() + 90 * 60 * 60 * 1000));
    const futureG = toDateTimeFields(new Date(Date.now() + 96 * 60 * 60 * 1000));
    const crossRes = await sessionB.postForm(`/patients/${patientPerm.id}`, formPerm, {
      appointmentId: apptPerm.id,
      option1Date: futureF.date,
      option1Time: futureF.time,
      option2Date: futureG.date,
      option2Time: futureG.time,
    });
    check("F5: cross-tenant propose responds ok (rejected, not 500)", crossRes.status === 200, `status=${crossRes.status}`);
    const crossCount = await prisma.patientResponseLink.count({ where: { appointmentId: apptPerm.id, purpose: "reschedule_offer" } });
    check("F6: cross-tenant propose did not create a link", crossCount === 0, `count=${crossCount}`);

    // ── G: Permission ─────────────────────────────────────────────────────
    console.log("\nG — permission (no appointments.manage)");
    const assistantRole = await prisma.role.findFirstOrThrow({ where: { key: "assistant", clinicId: null } });
    const assistantUser = await prisma.user.create({
      data: {
        email: "e2e-pro-assistant@e2e.local",
        fullName: "E2E PRO Assistant",
        clinicId: clinic.id,
        roleId: assistantRole.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(assistantUser.id);
    await prisma.assistant.create({ data: { clinicId: clinic.id, userId: assistantUser.id, assignedDoctorId: doctor.id } });
    const assistantSession = new Session();
    check("G0: assistant login", await assistantSession.login("e2e-pro-assistant@e2e.local"));

    const assistantPage = await assistantSession.get(`/patients/${patientPerm.id}`);
    check("G1: assistant does not see reschedule-options-form (no appointments.manage)",
      !assistantPage.html.includes("reschedule-options-form"));

    await assistantSession.postForm(`/patients/${patientPerm.id}`, formPerm, {
      appointmentId: apptPerm.id,
      option1Date: futureF.date,
      option1Time: futureF.time,
      option2Date: futureG.date,
      option2Time: futureG.time,
    });
    const denyCount = await prisma.patientResponseLink.count({ where: { appointmentId: apptPerm.id, purpose: "reschedule_offer" } });
    check("G2: assistant propose blocked — no link created (no appointments.manage)", denyCount === 0, `count=${denyCount}`);

    // ── Regression smoke ────────────────────────────────────────────────
    check("/dashboard (owner) opens", (await owner.get("/dashboard")).status === 200);
  } finally {
    console.log("\nCleanup…");
    const allTestPatients = await prisma.patient.findMany({
      where: { clinicId: clinic.id, firstName: { startsWith: "E2E-PRO-" } },
      select: { id: true },
    });
    const allTestIds = allTestPatients.map((p) => p.id);
    const allTestAppts = await prisma.appointment.findMany({ where: { patientId: { in: allTestIds } }, select: { id: true } });
    const allTestApptIds = allTestAppts.map((a) => a.id);
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.notification.deleteMany({ where: { OR: [{ patientId: { in: allTestIds } }, { appointmentId: { in: allTestApptIds } }] } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: allTestIds } } });

    await prisma.assistant.deleteMany({ where: { userId: { in: accountUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: accountUserIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: accountClinicIds } } });
    console.log("  (временные данные e2e удалены)");
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
