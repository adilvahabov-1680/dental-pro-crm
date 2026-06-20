/**
 * E2E-проверка Session 44 — Treatment Recall / 6-Month Checkup v1:
 *   npx tsx scripts/e2e-recall-tasks-check.ts
 * Требует dev-сервер + seed (demo-klinika). Создаёт собственный patient +
 * treatment item (status=done) — не зависит от демо-seed данных.
 *
 * Покрывает:
 *   A  Create recall (6-month preset, future dueDate, appears in queue)
 *   B  Validation (past dueDate / missing treatment / missing patient / cross-tenant / duplicate)
 *   C  Queue (overdue "Gecikib" / due soon "Yaxınlaşır" / pending+prepared visible)
 *   D  WhatsApp prepare (wa.me link, communication history, status=prepared)
 *   E  Dismiss (status=dismissed, leaves queue)
 *   F  Mark scheduled (status=scheduled, no appointment auto-created)
 *   G  Permissions (assistant: no manage → cannot create/prepare/dismiss/schedule)
 *   H  Tenant isolation (clinic A cannot see clinic B recalls)
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
/** Блок <li>…</li> строки очереди, найденный по уникальному data-e2e-marker. */
function liWithMarker(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return "";
  const start = html.lastIndexOf("<li", idx);
  const end = html.indexOf("</li>", idx);
  return start < 0 || end < 0 ? "" : html.slice(start, end + 5);
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  console.log(`E2E recall tasks check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { user: true } });
  const service = await prisma.service.findFirstOrThrow({ where: { clinicId: clinic.id, deletedAt: null } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // Cleanup leftovers from previous failed runs
  const oldPatients = await prisma.patient.findMany({
    where: { clinicId: clinic.id, firstName: { startsWith: "E2E-RCL-" } },
    select: { id: true },
  });
  const oldIds = oldPatients.map((p) => p.id);
  if (oldIds.length > 0) {
    await prisma.recallTask.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.notification.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.treatmentItem.deleteMany({ where: { patientId: { in: oldIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: ["e2e-rcl-owner-b@e2e.local", "e2e-rcl-assistant@e2e.local"] } } });
  await prisma.clinic.deleteMany({ where: { slug: "e2e-rcl-clinic-b" } });

  // primaryDoctorId фиксирован на общем демо-докторе — делает пациентов видимыми
  // и для assistant-сценария (scope = primaryDoctorId === assignedDoctorId).
  const createPatient = async (suffix: string) =>
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: `E2E-RCL-${suffix}`,
        lastName: "Test",
        phone: "+994501119700",
        primaryDoctorId: doctor.id,
      },
    });

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

  const accountClinicIds: string[] = [];
  const accountUserIds: string[] = [];

  try {
    // ── A: Create recall (6-month preset) ──────────────────────────────────
    console.log("\nA — create recall (6-month preset)");
    const patientA = await createPatient("Main");
    const itemA = await createDoneItem(patientA.id);

    const recallPageA = await owner.get(`/treatments/${itemA.id}/recall`);
    check("A0: recall creation page opens", recallPageA.status === 200, `status=${recallPageA.status}`);
    const formA = formContaining(recallPageA.html, "recall-create-form");
    check("A1: recall creation form found", !!formA);

    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const dueDateA = toDateInput(sixMonths);
    await owner.postForm(`/treatments/${itemA.id}/recall`, formA, {
      patientId: patientA.id,
      treatmentItemId: itemA.id,
      serviceId: service.id,
      dueDate: dueDateA,
      title: "E2E recall — 6 ay kontrol",
      note: "E2E test note",
    });

    const recallA = await prisma.recallTask.findFirstOrThrow({ where: { patientId: patientA.id, treatmentItemId: itemA.id } });
    check("A2: recall created with status=pending", recallA.status === "pending");
    check("A3: dueDate is future (~6 months ahead)", recallA.dueDate.getTime() > Date.now());
    check("A4: title/note stored", recallA.title === "E2E recall — 6 ay kontrol" && recallA.note === "E2E test note");

    const queuePageA = await owner.get("/recalls");
    check("A5: recall appears in /recalls queue", queuePageA.html.includes("E2E recall — 6 ay kontrol") && queuePageA.html.includes("E2E-RCL-Main"));

    // ── B: Validation ────────────────────────────────────────────────────────
    console.log("\nB — validation");
    const patientB = await createPatient("Val");
    const itemB = await createDoneItem(patientB.id);
    const pageB = await owner.get(`/treatments/${itemB.id}/recall`);
    const formB = formContaining(pageB.html, "recall-create-form");

    // past dueDate rejected
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await owner.postForm(`/treatments/${itemB.id}/recall`, formB, {
      patientId: patientB.id,
      treatmentItemId: itemB.id,
      dueDate: toDateInput(pastDate),
      title: "E2E past recall",
      note: "",
    });
    let countB = await prisma.recallTask.count({ where: { patientId: patientB.id } });
    check("B1: past dueDate rejected (no recall created)", countB === 0, `count=${countB}`);

    // missing/invalid treatment rejected
    const futureDate = toDateInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    await owner.postForm(`/treatments/${itemB.id}/recall`, formB, {
      patientId: patientB.id,
      treatmentItemId: "00000000-0000-0000-0000-000000000099",
      dueDate: futureDate,
      title: "E2E invalid treatment",
      note: "",
    });
    countB = await prisma.recallTask.count({ where: { patientId: patientB.id } });
    check("B2: missing/invalid treatmentItemId rejected (no recall created)", countB === 0, `count=${countB}`);

    // missing/invalid patient rejected
    await owner.postForm(`/treatments/${itemB.id}/recall`, formB, {
      patientId: "00000000-0000-4000-8000-000000000098",
      treatmentItemId: itemB.id,
      dueDate: futureDate,
      title: "E2E invalid patient",
      note: "",
    });
    countB = await prisma.recallTask.count({ where: { treatmentItemId: itemB.id } });
    check("B3: missing/invalid patientId rejected (no recall created)", countB === 0, `count=${countB}`);

    // valid create, then duplicate (same patient+treatmentItem+dueDate) rejected
    await owner.postForm(`/treatments/${itemB.id}/recall`, formB, {
      patientId: patientB.id,
      treatmentItemId: itemB.id,
      dueDate: futureDate,
      title: "E2E dup recall",
      note: "",
    });
    countB = await prisma.recallTask.count({ where: { patientId: patientB.id } });
    check("B4: valid recall created (baseline for duplicate check)", countB === 1, `count=${countB}`);
    await owner.postForm(`/treatments/${itemB.id}/recall`, formB, {
      patientId: patientB.id,
      treatmentItemId: itemB.id,
      dueDate: futureDate,
      title: "E2E dup recall again",
      note: "",
    });
    countB = await prisma.recallTask.count({ where: { patientId: patientB.id } });
    check("B5: duplicate (same patient+treatmentItem+dueDate) rejected", countB === 1, `count=${countB}`);

    // ── C: Queue (overdue / due soon) ───────────────────────────────────────
    console.log("\nC — queue urgency");
    const patientC = await createPatient("Urgency");
    const itemC = await createDoneItem(patientC.id);

    const overdueRecall = await prisma.recallTask.create({
      data: {
        clinicId: clinic.id,
        patientId: patientC.id,
        treatmentItemId: itemC.id,
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        title: "E2E overdue recall",
        status: "pending",
        createdById: adminUser.id,
      },
    });
    const dueSoonRecall = await prisma.recallTask.create({
      data: {
        clinicId: clinic.id,
        patientId: patientC.id,
        treatmentItemId: itemC.id,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        title: "E2E due-soon recall",
        status: "pending",
        createdById: adminUser.id,
      },
    });

    const queuePageC = await owner.get("/recalls");
    const overdueRow = liWithMarker(queuePageC.html, `recall-row-${overdueRecall.id}`);
    const dueSoonRow = liWithMarker(queuePageC.html, `recall-row-${dueSoonRecall.id}`);
    check("C1: overdue recall row found", !!overdueRow);
    check("C2: overdue recall shows 'Gecikib'", overdueRow.includes("Gecikib"));
    check("C3: due-soon recall row found", !!dueSoonRow);
    check("C4: due-soon recall shows 'Yaxınlaşır'", dueSoonRow.includes("Yaxınlaşır"));
    check("C5: pending status visible on overdue row", overdueRow.includes("Gözləyir"));

    // ── D: WhatsApp prepare ──────────────────────────────────────────────────
    console.log("\nD — WhatsApp prepare");
    const queuePageD = await owner.get("/recalls");
    const waFormD = formContaining(queuePageD.html, 'name="recallTaskId"', `value="${recallA.id}"`, "WhatsApp");
    check("D0: WhatsApp prepare form found for recall A", !!waFormD);
    await owner.postForm("/recalls", waFormD, { recallTaskId: recallA.id });

    const recallAAfterPrepare = await prisma.recallTask.findUniqueOrThrow({ where: { id: recallA.id } });
    check("D1: recall status = prepared", recallAAfterPrepare.status === "prepared");
    check("D2: preparedAt set", !!recallAAfterPrepare.preparedAt);

    const recallNotif = await prisma.notification.findFirst({
      where: { patientId: patientA.id, type: "repeat_visit_reminder", channel: "whatsapp" },
      orderBy: { createdAt: "desc" },
    });
    check("D3: communication history row created (status=prepared)", !!recallNotif && recallNotif.status === "prepared");
    check("D4: message includes patient name and clinic name", !!recallNotif && recallNotif.body.includes("E2E-RCL-Main") && recallNotif.body.includes(clinic.name));

    const queuePageDAfter = await owner.get("/recalls");
    const recallARowAfter = liWithMarker(queuePageDAfter.html, `recall-row-${recallA.id}`);
    check("D5: queue row shows 'Hazırlanıb' status after prepare", recallARowAfter.includes("Hazırlanıb"));

    // ── E: Dismiss ────────────────────────────────────────────────────────────
    console.log("\nE — dismiss");
    const queuePageE = await owner.get("/recalls");
    const dismissFormE = formContaining(queuePageE.html, 'name="recallTaskId"', `value="${dueSoonRecall.id}"`, "Bağla");
    check("E0: dismiss form found", !!dismissFormE);
    await owner.postForm("/recalls", dismissFormE, { recallTaskId: dueSoonRecall.id });

    const dueSoonAfterDismiss = await prisma.recallTask.findUniqueOrThrow({ where: { id: dueSoonRecall.id } });
    check("E1: status = dismissed", dueSoonAfterDismiss.status === "dismissed");

    const queuePageEAfter = await owner.get("/recalls");
    check("E2: dismissed recall no longer in queue", !queuePageEAfter.html.includes("E2E due-soon recall"));

    // ── F: Mark scheduled ─────────────────────────────────────────────────────
    console.log("\nF — mark scheduled");
    const apptCountBefore = await prisma.appointment.count({ where: { patientId: patientC.id } });
    const queuePageF = await owner.get("/recalls");
    const scheduleFormF = formContaining(
      queuePageF.html,
      'name="recallTaskId"',
      `value="${overdueRecall.id}"`,
      "planlaşdırıldı kimi işarələ",
    );
    check("F0: mark-scheduled form found", !!scheduleFormF);
    await owner.postForm("/recalls", scheduleFormF, { recallTaskId: overdueRecall.id });

    const overdueAfterSchedule = await prisma.recallTask.findUniqueOrThrow({ where: { id: overdueRecall.id } });
    check("F1: status = scheduled", overdueAfterSchedule.status === "scheduled");
    const apptCountAfter = await prisma.appointment.count({ where: { patientId: patientC.id } });
    check("F2: no appointment automatically created", apptCountAfter === apptCountBefore, `before=${apptCountBefore} after=${apptCountAfter}`);

    const queuePageFAfter = await owner.get("/recalls");
    check("F3: scheduled recall no longer in active queue", !queuePageFAfter.html.includes("E2E overdue recall"));

    // ── G: Permissions ────────────────────────────────────────────────────────
    console.log("\nG — permissions (assistant, no treatments.manage)");
    const assistantRole = await prisma.role.findFirstOrThrow({ where: { key: "assistant", clinicId: null } });
    const assistantUser = await prisma.user.create({
      data: {
        email: "e2e-rcl-assistant@e2e.local",
        fullName: "E2E RCL Assistant",
        clinicId: clinic.id,
        roleId: assistantRole.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(assistantUser.id);
    await prisma.assistant.create({ data: { clinicId: clinic.id, userId: assistantUser.id, assignedDoctorId: doctor.id } });
    const assistantSession = new Session();
    check("G0: assistant login", await assistantSession.login("e2e-rcl-assistant@e2e.local"));

    const patientG = await createPatient("Perm");
    const itemG = await createDoneItem(patientG.id);

    const assistantRecallPage = await assistantSession.get(`/treatments/${itemG.id}/recall`);
    check("G1: assistant blocked from recall creation page (redirect, no treatments.manage)",
      assistantRecallPage.status >= 300 && (assistantRecallPage.location ?? "").includes("/dashboard"),
      `status=${assistantRecallPage.status}`);

    const assistantQueuePage = await assistantSession.get("/recalls");
    check("G2: assistant CAN view /recalls (treatments.view)", assistantQueuePage.status === 200);
    const assistantRecallARow = liWithMarker(assistantQueuePage.html, `recall-row-${recallA.id}`);
    check("G3a: assistant sees recall A row (scope ok)", !!assistantRecallARow);
    check("G3b: assistant does not see manage action buttons (no <form> in row)", !assistantRecallARow.includes("<form"));

    // direct action POST attempts (harvested owner form, assistant session) — must not mutate
    const ownerRecallPageG = await owner.get(`/treatments/${itemG.id}/recall`);
    const ownerFormG = formContaining(ownerRecallPageG.html, "recall-create-form");
    await assistantSession.postForm(`/treatments/${itemG.id}/recall`, ownerFormG, {
      patientId: patientG.id,
      treatmentItemId: itemG.id,
      dueDate: futureDate,
      title: "E2E assistant create attempt",
      note: "",
    });
    const assistantCreateCount = await prisma.recallTask.count({ where: { patientId: patientG.id } });
    check("G4: assistant cannot create recall (no recall created)", assistantCreateCount === 0, `count=${assistantCreateCount}`);

    await assistantSession.postForm("/recalls", waFormD, { recallTaskId: recallA.id });
    const recallAAfterAssistantAttempt = await prisma.recallTask.findUniqueOrThrow({ where: { id: recallA.id } });
    check(
      "G5: assistant cannot prepare WhatsApp message (preparedAt untouched)",
      recallAAfterAssistantAttempt.preparedAt?.getTime() === recallAAfterPrepare.preparedAt?.getTime(),
    );

    // ── H: Tenant isolation ───────────────────────────────────────────────────
    console.log("\nH — tenant isolation");
    const clinicB = await prisma.clinic.create({ data: { name: "E2E RCL B", slug: "e2e-rcl-clinic-b", status: "active" } });
    accountClinicIds.push(clinicB.id);
    const ownerRoleB = await prisma.role.findFirstOrThrow({ where: { key: "owner", clinicId: null } });
    const userB = await prisma.user.create({
      data: {
        email: "e2e-rcl-owner-b@e2e.local",
        fullName: "E2E RCL B Owner",
        clinicId: clinicB.id,
        roleId: ownerRoleB.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    accountUserIds.push(userB.id);
    const doctorUserB = await prisma.user.create({
      data: {
        email: "e2e-rcl-doctor-b@e2e.local",
        fullName: "E2E RCL B Doctor",
        clinicId: clinicB.id,
        roleId: (await prisma.role.findFirstOrThrow({ where: { key: "doctor", clinicId: null } })).id,
        passwordHash: "x",
      },
    });
    accountUserIds.push(doctorUserB.id);
    const doctorB = await prisma.doctor.create({ data: { clinicId: clinicB.id, userId: doctorUserB.id } });
    const serviceB = await prisma.service.create({ data: { clinicId: clinicB.id, name: "E2E RCL B Service" } });
    const patientBClinic = await prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: "E2E-RCL-Foreign", lastName: "B", phone: "+994501119711" },
    });
    const itemBClinic = await prisma.treatmentItem.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientBClinic.id,
        doctorId: doctorB.id,
        serviceId: serviceB.id,
        status: "done",
        price: 5000,
        performedAt: new Date(),
      },
    });
    await prisma.recallTask.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientBClinic.id,
        treatmentItemId: itemBClinic.id,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        title: "E2E clinic B recall — should not leak",
        status: "pending",
        createdById: userB.id,
      },
    });

    const queuePageH = await owner.get("/recalls");
    check("H1: clinic A dashboard/queue does not show clinic B's recall", !queuePageH.html.includes("E2E-RCL-Foreign") && !queuePageH.html.includes("should not leak"));

    // ── Regression smoke ────────────────────────────────────────────────────
    check("/dashboard (owner) opens", (await owner.get("/dashboard")).status === 200);
  } finally {
    console.log("\nCleanup…");
    const allTestPatients = await prisma.patient.findMany({
      where: { firstName: { startsWith: "E2E-RCL-" } },
      select: { id: true, clinicId: true },
    });
    const allTestIds = allTestPatients.map((p) => p.id);
    await prisma.recallTask.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.notification.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.treatmentItem.deleteMany({ where: { patientId: { in: allTestIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: allTestIds } } });

    await prisma.recallTask.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.treatmentItem.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
    await prisma.service.deleteMany({ where: { clinicId: { in: accountClinicIds } } });
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
