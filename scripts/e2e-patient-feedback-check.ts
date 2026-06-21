/**
 * E2E-проверка Session 45 — Patient Feedback / Review Flow v1:
 *   npx tsx scripts/e2e-patient-feedback-check.ts
 * Требует dev-сервер + seed (demo-klinika). Создаёт собственные patient/
 * appointment/treatmentItem — не зависит от демо-seed данных.
 *
 * Покрывает:
 *   A  Link generation (appointment-triggered + treatment-item-triggered)
 *   B  Public page (no login, no internal id leak)
 *   C  Submit feedback (rating+comment stored, link used, staff notif, success)
 *   D  Validation (missing rating / out-of-range rating / comment too long)
 *   E  Token safety (single-use, expired, invalid)
 *   F  Internal visibility (patient page + /feedback) + tenant isolation
 *   G  Permission (assistant without patients.manage)
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, html: res.status < 300 ? await res.text() : "" };
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
async function main() {
  console.log(`E2E patient feedback check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { user: true } });
  const service = await prisma.service.findFirstOrThrow({ where: { clinicId: clinic.id, deletedAt: null } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // Cleanup leftovers from previous failed runs
  const oldPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-FBK-" } },
    select: { id: true },
  });
  const oldIds = oldPatients.map((p) => p.id);
  if (oldIds.length > 0) {
    await prisma.patientFeedback.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.notification.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.treatmentItem.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.user.deleteMany({ where: { email: "e2e-fbk-assistant@e2e.local" } });
  await prisma.clinic.deleteMany({ where: { slug: "e2e-fbk-clinic-b" } });

  // primaryDoctorId фиксирован на общем демо-докторе — делает пациентов видимыми
  // и для assistant-сценария (scope = primaryDoctorId === assignedDoctorId).
  const createPatient = async (suffix: string) =>
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: `E2E-FBK-${suffix}`,
        lastName: "Test",
        phone: "+994501119600",
        primaryDoctorId: doctor.id,
      },
    });

  const createCompletedAppt = async (patientId: string, hoursAgo: number) => {
    const startsAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId,
        doctorId: doctor.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: "completed",
        complaint: "e2e-patient-feedback",
        createdById: adminUser.id,
      },
    });
  };

  const createDoneItem = async (patientId: string) =>
    prisma.treatmentItem.create({
      data: {
        clinicId: clinic.id,
        patientId,
        doctorId: doctor.id,
        serviceId: service.id,
        status: "done",
        price: 10000,
        performedAt: new Date(),
      },
    });

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));
  const anon = new Session();

  const accountClinicIds: string[] = [];
  const accountUserIds: string[] = [];

  try {
    // ── A: Link generation ─────────────────────────────────────────────────
    console.log("\nA — link generation");
    const patientA = await createPatient("Main");
    const apptA = await createCompletedAppt(patientA.id, 5);

    const patientPageA = await owner.get(`/patients/${patientA.id}`);
    const feedbackFormA = formContaining(patientPageA.html, 'name="appointmentId"', `value="${apptA.id}"`, "Rəy linki hazırla");
    check("A1: feedback form found on completed appointment row", !!feedbackFormA);

    await owner.postForm(`/patients/${patientA.id}`, feedbackFormA, { appointmentId: apptA.id });

    const linkA = await prisma.patientResponseLink.findFirstOrThrow({
      where: { patientId: patientA.id, purpose: "feedback" },
      orderBy: { createdAt: "desc" },
    });
    check("A2: feedback link created, status=active", linkA.status === "active");
    check("A3: link.appointmentId set (appointment-triggered)", linkA.appointmentId === apptA.id);

    const feedbackNotifA = await prisma.notification.findFirst({
      where: { patientId: patientA.id, type: "feedback_received", channel: "whatsapp" },
      orderBy: { createdAt: "desc" },
    });
    check("A4: WhatsApp message includes feedback link", !!feedbackNotifA && feedbackNotifA.body.includes(`/r/${linkA.token}`));
    check("A5: communication history row status=prepared", feedbackNotifA?.status === "prepared");

    // treatment-item-triggered variant
    const patientA2 = await createPatient("Treat");
    const itemA2 = await createDoneItem(patientA2.id);
    const treatPageA2 = await owner.get(`/patients/${patientA2.id}/treatments`);
    const feedbackFormA2 = formContaining(treatPageA2.html, 'name="treatmentItemId"', `value="${itemA2.id}"`, "Rəy linki hazırla");
    check("A6: feedback form found on done treatment item", !!feedbackFormA2);
    await owner.postForm(`/patients/${patientA2.id}/treatments`, feedbackFormA2, { treatmentItemId: itemA2.id });
    const linkA2 = await prisma.patientResponseLink.findFirstOrThrow({
      where: { patientId: patientA2.id, purpose: "feedback" },
      orderBy: { createdAt: "desc" },
    });
    check("A7: treatment-triggered link has no appointmentId", linkA2.appointmentId === null);
    const ctx = linkA2.response as { kind?: string; treatmentItemId?: string | null } | null;
    check("A8: treatment-triggered link stores treatmentItemId in response", ctx?.treatmentItemId === itemA2.id);

    // ── B: Public page ────────────────────────────────────────────────────
    console.log("\nB — public page");
    const publicPageA = await anon.get(`/r/${linkA.token}`);
    check("B1: public page opens without login (200)", publicPageA.status === 200, `status=${publicPageA.status}`);
    check("B2: shows feedback form", publicPageA.html.includes("feedback-form"));
    check("B3: shows clinic name", publicPageA.html.includes("Demo Klinika"));
    check(
      "B4: does NOT leak internal ids",
      !publicPageA.html.includes(apptA.id) && !publicPageA.html.includes(patientA.id) && !publicPageA.html.includes(linkA.id),
    );

    // ── C: Submit feedback ───────────────────────────────────────────────
    console.log("\nC — submit feedback");
    const submitFormC = formContaining(publicPageA.html, "feedback-form");
    check("C0: feedback submit form found", !!submitFormC);
    const submitResC = await anon.postForm(`/r/${linkA.token}`, submitFormC, {
      token: linkA.token,
      rating: "5",
      comment: "Great service",
    });
    check("C1: submit responds ok", submitResC.status === 200, `status=${submitResC.status}`);

    const feedbackRowC = await prisma.patientFeedback.findFirstOrThrow({ where: { responseLinkId: linkA.id } });
    check("C2: rating stored = 5", feedbackRowC.rating === 5);
    check("C3: comment stored", feedbackRowC.comment === "Great service");
    check("C4: appointmentId carried over", feedbackRowC.appointmentId === apptA.id);

    const linkAAfter = await prisma.patientResponseLink.findUniqueOrThrow({ where: { id: linkA.id } });
    check("C5: link status = used", linkAAfter.status === "used");

    const staffNotifC = await prisma.notification.findFirst({
      where: { appointmentId: apptA.id, channel: "in_app", type: "feedback_received" },
    });
    check("C6: staff notification created", !!staffNotifC && staffNotifC.body.includes("5/5"));

    const afterSubmitPageC = await anon.get(`/r/${linkA.token}`);
    check("C7: re-opening shows used/already-submitted message", afterSubmitPageC.html.includes("Rəy artıq göndərilib"));

    // ── D: Validation ─────────────────────────────────────────────────────
    console.log("\nD — validation");
    const patientD = await createPatient("Val");
    const apptD = await createCompletedAppt(patientD.id, 6);
    const patientPageD = await owner.get(`/patients/${patientD.id}`);
    const feedbackFormD = formContaining(patientPageD.html, 'name="appointmentId"', `value="${apptD.id}"`, "Rəy linki hazırla");
    await owner.postForm(`/patients/${patientD.id}`, feedbackFormD, { appointmentId: apptD.id });
    const linkD = await prisma.patientResponseLink.findFirstOrThrow({ where: { patientId: patientD.id, purpose: "feedback" } });
    const publicPageD = await anon.get(`/r/${linkD.token}`);
    const submitFormD = formContaining(publicPageD.html, "feedback-form");

    // missing rating (harvested hidden input defaults to "0" — not overridden here)
    await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token });
    let countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("D1: missing/zero rating rejected (no feedback stored)", countD === 0, `count=${countD}`);

    // out-of-range rating
    await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token, rating: "6" });
    countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("D2: out-of-range rating (6) rejected", countD === 0, `count=${countD}`);
    await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token, rating: "0" });
    countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("D3: out-of-range rating (0) rejected", countD === 0, `count=${countD}`);

    // comment too long (>1000)
    await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token, rating: "4", comment: "x".repeat(1001) });
    countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("D4: comment too long rejected", countD === 0, `count=${countD}`);

    // valid submit still works after all the rejected attempts (link still active)
    await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token, rating: "4" });
    countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("D5: valid submit (rating=4, no comment) succeeds", countD === 1, `count=${countD}`);

    // ── E: Token safety ────────────────────────────────────────────────────
    console.log("\nE — token safety");
    const replayResE = await anon.postForm(`/r/${linkD.token}`, submitFormD, { token: linkD.token, rating: "2" });
    check("E1: second submit on used token responds ok (rejected gracefully)", replayResE.status === 200);
    countD = await prisma.patientFeedback.count({ where: { responseLinkId: linkD.id } });
    check("E2: replay did not create a second feedback row", countD === 1, `count=${countD}`);

    const patientE = await createPatient("Expired");
    const apptE = await createCompletedAppt(patientE.id, 7);
    const expiredLink = await prisma.patientResponseLink.create({
      data: {
        clinicId: clinic.id,
        patientId: patientE.id,
        appointmentId: apptE.id,
        token: "e2e-fbk-expired-token-" + Math.random().toString(36).slice(2),
        purpose: "feedback",
        status: "active",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredPageE = await anon.get(`/r/${expiredLink.token}`);
    check("E3: expired feedback token shows generic expired message", expiredPageE.html.includes("Linkin müddəti bitib"));
    await anon.postForm(`/r/${expiredLink.token}`, submitFormD, { token: expiredLink.token, rating: "3" });
    const expiredFeedbackCount = await prisma.patientFeedback.count({ where: { responseLinkId: expiredLink.id } });
    check("E4: expired token submit blocked (no feedback stored)", expiredFeedbackCount === 0);

    const garbageResE = await anon.postForm(`/r/totally-invalid-feedback-token-000`, submitFormD, {
      token: "totally-invalid-feedback-token-000",
      rating: "5",
    });
    check("E5: invalid token submit responds ok (no crash)", garbageResE.status === 200, `status=${garbageResE.status}`);

    // ── F: Internal visibility + tenant isolation ──────────────────────────
    console.log("\nF — internal visibility & tenant isolation");
    const patientPageF = await owner.get(`/patients/${patientA.id}`);
    check("F1: feedback visible on patient detail page", patientPageF.html.includes("Great service") && patientPageF.html.includes("5/5"));

    const feedbackListPageF = await owner.get("/feedback");
    check("F2: /feedback page opens", feedbackListPageF.status === 200);
    check("F3: /feedback lists the patient + rating", feedbackListPageF.html.includes("E2E-FBK-Main") && feedbackListPageF.html.includes("Great service"));

    const clinicB = await prisma.clinic.create({ data: { name: "E2E FBK B", slug: "e2e-fbk-clinic-b", status: "active" } });
    accountClinicIds.push(clinicB.id);
    const doctorUserB = await prisma.user.create({
      data: {
        email: "e2e-fbk-doctor-b@e2e.local",
        fullName: "E2E FBK B Doctor",
        clinicId: clinicB.id,
        roleId: (await prisma.role.findFirstOrThrow({ where: { key: "doctor", clinicId: null } })).id,
        passwordHash: "x",
      },
    });
    accountUserIds.push(doctorUserB.id);
    const doctorB = await prisma.doctor.create({ data: { clinicId: clinicB.id, userId: doctorUserB.id } });
    const patientBClinic = await prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: "E2E-FBK-Foreign", lastName: "B", phone: "+994501119611" },
    });
    const apptBClinic = await prisma.appointment.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientBClinic.id,
        doctorId: doctorB.id,
        startsAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
        status: "completed",
        createdById: doctorUserB.id,
      },
    });
    const linkBClinic = await prisma.patientResponseLink.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientBClinic.id,
        appointmentId: apptBClinic.id,
        token: "e2e-fbk-clinicb-token-" + Math.random().toString(36).slice(2),
        purpose: "feedback",
        status: "used",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.patientFeedback.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientBClinic.id,
        appointmentId: apptBClinic.id,
        responseLinkId: linkBClinic.id,
        rating: 1,
        comment: "should not leak across tenants",
        submittedAt: new Date(),
      },
    });

    const feedbackListPageH = await owner.get("/feedback");
    check(
      "F4: clinic A /feedback does not show clinic B's feedback",
      !feedbackListPageH.html.includes("E2E-FBK-Foreign") && !feedbackListPageH.html.includes("should not leak across tenants"),
    );

    // ── G: Permission ─────────────────────────────────────────────────────
    console.log("\nG — permission (assistant, no patients.manage)");
    const assistantRole = await prisma.role.findFirstOrThrow({ where: { key: "assistant", clinicId: null } });
    const assistantUser = await prisma.user.create({
      data: {
        email: "e2e-fbk-assistant@e2e.local",
        fullName: "E2E FBK Assistant",
        clinicId: clinic.id,
        roleId: assistantRole.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(assistantUser.id);
    await prisma.assistant.create({ data: { clinicId: clinic.id, userId: assistantUser.id, assignedDoctorId: doctor.id } });
    const assistantSession = new Session();
    check("G0: assistant login", await assistantSession.login("e2e-fbk-assistant@e2e.local"));

    const patientG = await createPatient("Perm");
    const apptG = await createCompletedAppt(patientG.id, 8);

    const assistantPatientPage = await assistantSession.get(`/patients/${patientG.id}`);
    check("G1: assistant does not see feedback create form (no patients.manage)", !assistantPatientPage.html.includes("Rəy linki hazırla"));

    const ownerPatientPageG = await owner.get(`/patients/${patientG.id}`);
    const ownerFeedbackFormG = formContaining(ownerPatientPageG.html, 'name="appointmentId"', `value="${apptG.id}"`, "Rəy linki hazırla");
    await assistantSession.postForm(`/patients/${patientG.id}`, ownerFeedbackFormG, { appointmentId: apptG.id });
    const denyCountG = await prisma.patientResponseLink.count({ where: { patientId: patientG.id, purpose: "feedback" } });
    check("G2: assistant propose blocked — no link created (no patients.manage)", denyCountG === 0, `count=${denyCountG}`);

    check("G3: assistant CAN view /feedback (patients.view)", (await assistantSession.get("/feedback")).status === 200);

    // ── Regression smoke ────────────────────────────────────────────────
    check("/dashboard (owner) opens", (await owner.get("/dashboard")).status === 200);
  } finally {
    console.log("\nCleanup…");
    const allTestPatients = await prisma.patient.findMany({
      where: { firstName: { startsWith: "E2E-FBK-" } },
      select: { id: true },
    });
    const allTestIds = allTestPatients.map((p) => p.id);
    await prisma.patientFeedback.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.patientResponseLink.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.notification.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.treatmentItem.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: allTestIds } } });

    await prisma.patientFeedback.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.patientResponseLink.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.appointment.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.patient.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.doctor.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
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
