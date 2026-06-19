/**
 * E2E-проверка Session 41 — Patient Response Link Foundation v1:
 *   npx tsx scripts/e2e-patient-response-links-check.ts
 * Требует dev-сервер + seed (demo-klinika).
 *
 * Покрывает:
 *   A  Link generation (prepareAppointmentReminder создаёт/переиспользует link)
 *   B  Public page (без логина, минимум данных, no internal-id leak, expired/invalid)
 *   C  Confirm response
 *   D  Late response (+ предупреждение про 15 минут)
 *   E  Reschedule request response
 *   F  Cancel response (+ comment)
 *   G  Token safety (single-use, invalid token, no session required)
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
  async postForm(path: string, pageHtml: string, fields: Record<string, string>, markerFilter?: string) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    let html = pageHtml;
    if (markerFilter) {
      const idx = pageHtml.indexOf(`data-e2e-marker="${markerFilter}"`);
      if (idx !== -1) {
        const start = pageHtml.lastIndexOf("<form", idx);
        const end = pageHtml.indexOf("</form>", idx) + 7;
        html = start !== -1 ? pageHtml.slice(start, end) : pageHtml;
      }
    }
    for (const tag of [...html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
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

async function main() {
  console.log(`E2E patient response links check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { clinicId: clinic.id },
    include: { user: true },
  });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // Cleanup leftovers from previous failed runs
  const oldPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-PRL-" } },
    select: { id: true },
  });
  const oldIds = oldPatients.map((p) => p.id);
  if (oldIds.length > 0) {
    const oldAppts = await prisma.appointment.findMany({
      where: { patientId: { in: oldIds } },
      select: { id: true },
    });
    const oldApptIds = oldAppts.map((a) => a.id);
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.notification.deleteMany({
      where: { OR: [{ patientId: { in: oldIds } }, { appointmentId: { in: oldApptIds } }] },
    });
    await prisma.appointment.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: oldIds } } });
  }

  console.log("Setup — creating test data…");

  const createPatient = async (suffix: string) =>
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: `E2E-PRL-${suffix}`,
        lastName: "Test",
        phone: "+994501112200",
      },
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
        complaint: "e2e-patient-response-links",
        createdById: adminUser.id,
      },
    });
  };

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));
  await owner.login("admin@demo.dentalpro.az"); // warm-up

  // ── A: Link generation ───────────────────────────────────────────────
  console.log("\nA — link generation");
  const patientA = await createPatient("A");
  const apptA = await createAppt(patientA.id, 20);

  const patientPageA = await owner.get(`/patients/${patientA.id}`);
  const reminderFormA = formContaining(patientPageA.html, 'name="appointmentId"', `value="${apptA.id}"`);
  check("A1: reminder form found on patient page", !!reminderFormA);

  await owner.postForm(`/patients/${patientA.id}`, reminderFormA, { appointmentId: apptA.id });

  const linksAfterFirst = await prisma.patientResponseLink.findMany({
    where: { appointmentId: apptA.id },
  });
  check("A2: exactly one active link created", linksAfterFirst.length === 1, `count=${linksAfterFirst.length}`);
  const linkA = linksAfterFirst[0];
  check("A3: link status=active, purpose=confirm_appointment", linkA?.status === "active" && linkA?.purpose === "confirm_appointment");
  check(
    "A4: token is high-entropy (>=20 url-safe chars)",
    !!linkA && /^[A-Za-z0-9_-]{20,64}$/.test(linkA.token),
  );
  check(
    "A5: expiresAt ~48h ahead",
    !!linkA && linkA.expiresAt.getTime() - Date.now() > 47 * 60 * 60 * 1000,
  );

  const reminderNotif = await prisma.notification.findFirst({
    where: { appointmentId: apptA.id, type: "appointment_reminder", channel: "whatsapp" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "A6: reminder message includes response link",
    !!reminderNotif && !!linkA && reminderNotif.body.includes(`/r/${linkA.token}`),
  );

  // repeat prepare → same link reused, not duplicated
  const patientPageA2 = await owner.get(`/patients/${patientA.id}`);
  const reminderFormA2 = formContaining(patientPageA2.html, 'name="appointmentId"', `value="${apptA.id}"`);
  await owner.postForm(`/patients/${patientA.id}`, reminderFormA2, { appointmentId: apptA.id });
  const linksAfterSecond = await prisma.patientResponseLink.findMany({ where: { appointmentId: apptA.id } });
  check(
    "A7: repeat prepare reuses the same active link (still exactly 1)",
    linksAfterSecond.length === 1 && linksAfterSecond[0].token === linkA.token,
    `count=${linksAfterSecond.length}`,
  );

  // ── B: Public page ───────────────────────────────────────────────────
  console.log("\nB — public page");
  const anon = new Session();
  const publicPageA = await anon.get(`/r/${linkA.token}`);
  check("B1: public page opens without login (200)", publicPageA.status === 200, `status=${publicPageA.status}`);
  check("B2: shows clinic name", publicPageA.html.includes("Demo Klinika"));
  check("B3: shows doctor name", publicPageA.html.includes(doctor.user.fullName));
  check("B4: shows patient name", publicPageA.html.includes("E2E-PRL-A"));
  check(
    "B5: shows all 4 response options",
    publicPageA.html.includes("Gələcəyəm") &&
      publicPageA.html.includes("Gecikə bilərəm") &&
      publicPageA.html.includes("Vaxtı dəyişmək istəyirəm") &&
      publicPageA.html.includes("Ləğv etmək istəyirəm"),
  );
  check(
    "B6: does NOT leak internal ids (appointment/patient/link id)",
    !publicPageA.html.includes(apptA.id) &&
      !publicPageA.html.includes(patientA.id) &&
      !publicPageA.html.includes(linkA.id),
  );

  const invalidTokenPage = await anon.get(`/r/this-token-does-not-exist-at-all-xyz`);
  check("B7: invalid token → 200 graceful (not 404/500)", invalidTokenPage.status === 200, `status=${invalidTokenPage.status}`);
  check("B8: invalid token shows generic expired/not-found message", invalidTokenPage.html.includes("Linkin müddəti bitib"));

  // expired link (separate, untouched by other sections)
  const patientExp = await createPatient("Expired");
  const apptExp = await createAppt(patientExp.id, 5);
  const expiredLink = await prisma.patientResponseLink.create({
    data: {
      clinicId: clinic.id,
      patientId: patientExp.id,
      appointmentId: apptExp.id,
      token: "e2e-prl-expired-token-" + Math.random().toString(36).slice(2),
      purpose: "confirm_appointment",
      status: "active",
      expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
    },
  });
  const expiredPage = await anon.get(`/r/${expiredLink.token}`);
  check("B9: expired token shows 'Linkin müddəti bitib'", expiredPage.html.includes("Linkin müddəti bitib"));

  // ── C: Confirm response ──────────────────────────────────────────────
  console.log("\nC — confirm response");
  const confirmPage = await anon.get(`/r/${linkA.token}`);
  const confirmForm = formContaining(confirmPage.html, "patient-response-form");
  const confirmRes = await anon.postForm(`/r/${linkA.token}`, confirmForm, {
    token: linkA.token,
    responseType: "confirm",
  });
  check("C1: confirm submit responds ok", confirmRes.status === 200, `status=${confirmRes.status}`);

  const apptAAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptA.id } });
  check("C2: appointment status = confirmed", apptAAfter.status === "confirmed", `got ${apptAAfter.status}`);
  check("C3: patientResponseStatus = confirmed", apptAAfter.patientResponseStatus === "confirmed");

  const linkAAfter = await prisma.patientResponseLink.findUniqueOrThrow({ where: { id: linkA.id } });
  check("C4: link status = used", linkAAfter.status === "used");
  check("C5: link respondedAt set", !!linkAAfter.respondedAt);
  check("C6: link responseType = confirm", linkAAfter.responseType === "confirm");

  const patientLogC = await prisma.notification.findFirst({
    where: { patientId: patientA.id, appointmentId: apptA.id, channel: "other" },
    orderBy: { createdAt: "desc" },
  });
  check("C7: patient communication history row created", !!patientLogC && patientLogC.body.includes("təsdiqlədi"));

  const staffNotifC = await prisma.notification.findFirst({
    where: { appointmentId: apptA.id, channel: "in_app", userId: null },
    orderBy: { createdAt: "desc" },
  });
  check("C8: staff notification created", !!staffNotifC && staffNotifC.body.includes("E2E-PRL-A"));

  const usedPageC = await anon.get(`/r/${linkA.token}`);
  check("C9: re-opening used link shows 'already used'", usedPageC.html.includes("Bu link artıq istifadə olunub"));

  // ── D: Late response ─────────────────────────────────────────────────
  console.log("\nD — late response");
  const patientD = await createPatient("D");
  const apptD = await createAppt(patientD.id, 21);
  const patientPageD = await owner.get(`/patients/${patientD.id}`);
  const reminderFormD = formContaining(patientPageD.html, 'name="appointmentId"', `value="${apptD.id}"`);
  await owner.postForm(`/patients/${patientD.id}`, reminderFormD, { appointmentId: apptD.id });
  const linkD = await prisma.patientResponseLink.findFirstOrThrow({ where: { appointmentId: apptD.id } });

  const activePageD = await anon.get(`/r/${linkD.token}`);
  check("D1: active page shows 15-minute late warning", activePageD.html.includes("15 dəqiqə"));

  const lateForm = formContaining(activePageD.html, "patient-response-form");
  await anon.postForm(`/r/${linkD.token}`, lateForm, { token: linkD.token, responseType: "running_late" });

  const apptDAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptD.id } });
  check("D2: appointment status = running_late", apptDAfter.status === "running_late", `got ${apptDAfter.status}`);
  check("D3: patientResponseStatus = running_late", apptDAfter.patientResponseStatus === "running_late");

  const staffNotifD = await prisma.notification.findFirst({
    where: { appointmentId: apptD.id, channel: "in_app", userId: null },
  });
  check("D4: staff notification created for late response", !!staffNotifD);

  // ── E: Reschedule request response ───────────────────────────────────
  console.log("\nE — reschedule request response");
  const patientE = await createPatient("E");
  const apptE = await createAppt(patientE.id, 22);
  const patientPageE = await owner.get(`/patients/${patientE.id}`);
  const reminderFormE = formContaining(patientPageE.html, 'name="appointmentId"', `value="${apptE.id}"`);
  await owner.postForm(`/patients/${patientE.id}`, reminderFormE, { appointmentId: apptE.id });
  const linkE = await prisma.patientResponseLink.findFirstOrThrow({ where: { appointmentId: apptE.id } });

  const activePageE = await anon.get(`/r/${linkE.token}`);
  const rescheduleForm = formContaining(activePageE.html, "patient-response-form");
  await anon.postForm(`/r/${linkE.token}`, rescheduleForm, { token: linkE.token, responseType: "reschedule_request" });

  const apptEAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptE.id } });
  check("E1: appointment status = reschedule_requested", apptEAfter.status === "reschedule_requested", `got ${apptEAfter.status}`);

  const staffNotifE = await prisma.notification.findFirst({
    where: { appointmentId: apptE.id, channel: "in_app", userId: null },
  });
  check("E2: staff notification mentions reschedule", !!staffNotifE && staffNotifE.body.includes("dəyiş"));

  // ── F: Cancel response ───────────────────────────────────────────────
  console.log("\nF — cancel response");
  const patientF = await createPatient("F");
  const apptF = await createAppt(patientF.id, 23);
  const patientPageF = await owner.get(`/patients/${patientF.id}`);
  const reminderFormF = formContaining(patientPageF.html, 'name="appointmentId"', `value="${apptF.id}"`);
  await owner.postForm(`/patients/${patientF.id}`, reminderFormF, { appointmentId: apptF.id });
  const linkF = await prisma.patientResponseLink.findFirstOrThrow({ where: { appointmentId: apptF.id } });

  const activePageF = await anon.get(`/r/${linkF.token}`);
  const cancelForm = formContaining(activePageF.html, "patient-response-form");
  await anon.postForm(`/r/${linkF.token}`, cancelForm, {
    token: linkF.token,
    responseType: "cancel",
    comment: "E2E test cancel comment",
  });

  const apptFAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptF.id } });
  check("F1: appointment status = cancelled", apptFAfter.status === "cancelled", `got ${apptFAfter.status}`);

  const linkFAfter = await prisma.patientResponseLink.findUniqueOrThrow({ where: { id: linkF.id } });
  check("F2: responseComment stored", linkFAfter.responseComment === "E2E test cancel comment");

  const staffNotifF = await prisma.notification.findFirst({
    where: { appointmentId: apptF.id, channel: "in_app", userId: null },
  });
  check("F3: staff notification mentions cancellation", !!staffNotifF && staffNotifF.body.includes("ləğv"));

  // ── G: Token safety ───────────────────────────────────────────────────
  console.log("\nG — token safety");

  // Dedicated fresh active link, used only to harvest a valid $ACTION form
  // (the "used"/"expired"/"not found" pages never render the form, so the
  // action's own server-side token validation — not just form availability —
  // is what's actually being exercised below by swapping the token value).
  const patientG = await createPatient("G");
  const apptG = await createAppt(patientG.id, 24);
  const patientPageG = await owner.get(`/patients/${patientG.id}`);
  const reminderFormG = formContaining(patientPageG.html, 'name="appointmentId"', `value="${apptG.id}"`);
  await owner.postForm(`/patients/${patientG.id}`, reminderFormG, { appointmentId: apptG.id });
  const linkG = await prisma.patientResponseLink.findFirstOrThrow({ where: { appointmentId: apptG.id } });
  const activePageG = await anon.get(`/r/${linkG.token}`);
  const harvestedForm = formContaining(activePageG.html, "patient-response-form");
  check("G0: harvested a valid action form for token-swap tests", !!harvestedForm);

  // re-submit on an already-used token (linkA, used in section C)
  const reuseRes = await anon.postForm(`/r/${linkA.token}`, harvestedForm, {
    token: linkA.token,
    responseType: "cancel",
  });
  check("G1: second submit on used token responds ok (rejected gracefully)", reuseRes.status === 200);
  const apptAStillConfirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: apptA.id } });
  check(
    "G2: appointment status unchanged after replay attempt (still confirmed, not cancelled)",
    apptAStillConfirmed.status === "confirmed",
    `got ${apptAStillConfirmed.status}`,
  );

  // invalid/garbage token, but with otherwise-valid action reference
  const garbageRes = await anon.postForm(`/r/totally-invalid-garbage-token-000`, harvestedForm, {
    token: "totally-invalid-garbage-token-000",
    responseType: "confirm",
  });
  check("G3: submit with invalid token responds ok (no crash)", garbageRes.status === 200, `status=${garbageRes.status}`);
  const apptGUnaffected = await prisma.appointment.findUniqueOrThrow({ where: { id: apptG.id } });
  check(
    "G3b: unrelated appointment (G) untouched by the invalid-token submit",
    apptGUnaffected.status === "scheduled",
  );

  // no session required anywhere in this flow (anon Session never logged in)
  check("G4: entire public flow completed without any session cookie", !anon.cookies.has("dp_session"));

  // now consume linkG legitimately, to confirm the harvested form/link itself still works
  await anon.postForm(`/r/${linkG.token}`, harvestedForm, { token: linkG.token, responseType: "confirm" });
  const apptGAfter = await prisma.appointment.findUniqueOrThrow({ where: { id: apptG.id } });
  check("G5: harvested link still resolves to its own appointment correctly", apptGAfter.status === "confirmed");

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup…");
  const allTestPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-PRL-" } },
    select: { id: true },
  });
  const allTestIds = allTestPatients.map((p) => p.id);
  const allTestAppts = await prisma.appointment.findMany({
    where: { patientId: { in: allTestIds } },
    select: { id: true },
  });
  const allTestApptIds = allTestAppts.map((a) => a.id);
  await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: allTestIds } } });
  await prisma.notification.deleteMany({
    where: { OR: [{ patientId: { in: allTestIds } }, { appointmentId: { in: allTestApptIds } }] },
  });
  await prisma.appointment.deleteMany({ where: { patientId: { in: allTestIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: allTestIds } } });

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
