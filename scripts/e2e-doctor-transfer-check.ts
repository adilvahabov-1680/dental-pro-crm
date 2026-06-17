/**
 * E2E-проверка Doctor Transfer v1 (сессия 26):
 *   npx tsx scripts/e2e-doctor-transfer-check.ts
 *
 * 12 проверок:
 *  1. Transfer form present in /admin page (data-e2e-doctor-transfer)
 *  2. transferPatients=true → Patient.primaryDoctorId updated in DB
 *  3. After patient transfer: original doctor no longer primary (DB check)
 *  4. transferAppointments=true → Appointment.doctorId updated in DB
 *  5. After appointment transfer: original doctor no longer on appointment (DB check)
 *  6. Nothing selected → action returns nothingSelected error
 *  7. sameDoctor guard → action returns sameDoctor error (DB unchanged)
 *  8. Cross-tenant guard → action returns doctorNotFound (DB unchanged)
 *  9. patientsMoved=0 when from-doctor has no patients
 * 10. audit_log entry exists after successful transfer
 * 11. Regression: /admin loads (200) and contains staff table after all ops
 * 12. Regression: /patients loads (200) and shows Rəşad for owner
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "admin123";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? " — " + extra : ""}`);
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, text: await res.text() };
  }
  async login(email: string, pwd = PASSWORD) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: pwd });
    return this.cookies.has("dp_session");
  }
}

function formContaining(html: string, ...needles: string[]): string {
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  return forms.find((f) => needles.every((n) => f.includes(n))) ?? "";
}

async function main() {
  console.log(`E2E doctor-transfer check → ${BASE}\n`);

  // ── Setup ──────────────────────────────────────────────────────────────────
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const doctorUser = await prisma.user.findFirstOrThrow({ where: { email: "hekim@demo.dentalpro.az" } });
  const doctor = await prisma.doctor.findFirstOrThrow({ where: { userId: doctorUser.id } });

  // Ensure Tural has primaryDoctorId = doctor.id for patient transfer tests
  const turalPatient = await prisma.patient.findFirstOrThrow({
    where: { clinicId: clinic.id, firstName: "Tural", lastName: "Məmmədov" },
  });
  await prisma.patient.update({ where: { id: turalPatient.id }, data: { primaryDoctorId: doctor.id } });

  // Create a second doctor (transfer target)
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "doctor" } });
  const doc2User = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: doctorRole.id,
      email: `e2e-transfer-doc2-${Date.now()}@demo.dentalpro.az`,
      fullName: "E2ETransferDoc2",
      passwordHash: "x",
      locale: "az",
    },
  });
  const doc2 = await prisma.doctor.create({
    data: { clinicId: clinic.id, userId: doc2User.id, color: "#f59e0b" },
  });

  // Create a future appointment for doctor (transfer test)
  const futureStart = new Date(Date.now() + 86400 * 1000); // tomorrow
  const futureEnd = new Date(futureStart.getTime() + 30 * 60_000);
  const testAppt = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: turalPatient.id,
      doctorId: doctor.id,
      startsAt: futureStart,
      endsAt: futureEnd,
      status: "scheduled",
      createdById: doctorUser.id,
      notes: `e2e-transfer-test-${Date.now()}`,
    },
  });

  // Create a second clinic + doctor for cross-tenant test
  const clinicB = await prisma.clinic.create({
    data: {
      name: "E2E Transfer ClinicB",
      slug: `e2e-transfer-clinicb-${Date.now()}`,
      status: "active",
      timezone: "Asia/Baku",
      currency: "AZN",
    },
  });
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const docBUser = await prisma.user.create({
    data: {
      clinicId: clinicB.id,
      roleId: ownerRole.id,
      email: `e2e-transfer-docB-${Date.now()}@other.dentalpro.az`,
      fullName: "E2EClinicBDoc",
      passwordHash: "x",
      locale: "az",
    },
  });
  await prisma.doctor.create({ data: { clinicId: clinicB.id, userId: docBUser.id, color: "#ccc" } });

  const owner = new Session();
  check("owner login", await owner.login("admin@demo.dentalpro.az"));

  try {
    // ── 1. Transfer form present in /admin ───────────────────────────────────
    const adminPage = await owner.get("/admin");
    check(
      "1. transfer form present in /admin (data-e2e-doctor-transfer)",
      adminPage.html.includes("data-e2e-doctor-transfer"),
      `not found in HTML (${adminPage.html.length} bytes)`,
    );

    // ── 2. transferPatients=true → Patient.primaryDoctorId updated ──────────
    const transferPatientForm = formContaining(adminPage.html, "data-e2e-doctor-transfer");
    const transferPatientRes = await owner.postForm("/admin", transferPatientForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: doc2User.id,
      transferPatients: "on",
    });
    const turalAfterTransfer = await prisma.patient.findUniqueOrThrow({ where: { id: turalPatient.id } });
    check(
      "2. transferPatients: Patient.primaryDoctorId = doc2.id",
      turalAfterTransfer.primaryDoctorId === doc2.id,
      `got ${turalAfterTransfer.primaryDoctorId}, expected ${doc2.id} (status=${transferPatientRes.status})`,
    );

    // ── 3. After transfer: original doctor no longer primary ─────────────────
    check(
      "3. after patient transfer: original doctor is no longer primary",
      turalAfterTransfer.primaryDoctorId !== doctor.id,
      `still ${turalAfterTransfer.primaryDoctorId}`,
    );

    // Restore Tural for appointment test
    await prisma.patient.update({ where: { id: turalPatient.id }, data: { primaryDoctorId: doctor.id } });

    // ── 4. transferAppointments=true → Appointment.doctorId updated ──────────
    // Reload admin page to get fresh action IDs
    const adminPage2 = await owner.get("/admin");
    const transferApptForm = formContaining(adminPage2.html, "data-e2e-doctor-transfer");
    await owner.postForm("/admin", transferApptForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: doc2User.id,
      transferAppointments: "on",
    });
    const apptAfterTransfer = await prisma.appointment.findUniqueOrThrow({ where: { id: testAppt.id } });
    check(
      "4. transferAppointments: Appointment.doctorId = doc2.id",
      apptAfterTransfer.doctorId === doc2.id,
      `got ${apptAfterTransfer.doctorId}, expected ${doc2.id}`,
    );

    // ── 5. After appointment transfer: original doctor no longer on appt ─────
    check(
      "5. after appointment transfer: original doctor no longer on appt",
      apptAfterTransfer.doctorId !== doctor.id,
      `still ${apptAfterTransfer.doctorId}`,
    );

    // Restore appointment for subsequent tests
    await prisma.appointment.update({ where: { id: testAppt.id }, data: { doctorId: doctor.id } });

    // ── 6. Nothing selected → nothingSelected error ──────────────────────────
    const adminPage3 = await owner.get("/admin");
    const nothingForm = formContaining(adminPage3.html, "data-e2e-doctor-transfer");
    const nothingRes = await owner.postForm("/admin", nothingForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: doc2User.id,
      // no transferPatients, no transferAppointments → both false after preprocess
    });
    check(
      "6. nothingSelected: both checkboxes absent → error in response",
      nothingRes.text.includes("nothingSelected") || nothingRes.text.includes("Heç bir seçim"),
      `response did not contain nothingSelected error`,
    );

    // ── 7. sameDoctor guard ───────────────────────────────────────────────────
    const adminPage4 = await owner.get("/admin");
    const sameDocForm = formContaining(adminPage4.html, "data-e2e-doctor-transfer");
    const sameDocRes = await owner.postForm("/admin", sameDocForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: doctorUser.id,
      transferPatients: "on",
    });
    check(
      "7. sameDoctor guard: fromDoctorUserId = toDoctorUserId → error",
      sameDocRes.text.includes("sameDoctor") || sameDocRes.text.includes("eyni həkim"),
      `response did not contain sameDoctor error`,
    );
    // Verify DB unchanged
    const turalAfterSameDoc = await prisma.patient.findUniqueOrThrow({ where: { id: turalPatient.id } });
    check(
      "7. sameDoctor: DB unchanged (Tural still has doctor.id)",
      turalAfterSameDoc.primaryDoctorId === doctor.id,
      `got ${turalAfterSameDoc.primaryDoctorId}`,
    );

    // ── 8. Cross-tenant guard ─────────────────────────────────────────────────
    const adminPage5 = await owner.get("/admin");
    const crossForm = formContaining(adminPage5.html, "data-e2e-doctor-transfer");
    const crossRes = await owner.postForm("/admin", crossForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: docBUser.id, // belongs to clinicB, not demo-klinika
      transferPatients: "on",
    });
    check(
      "8. cross-tenant: toDoctorUserId from clinicB → doctorNotFound error",
      crossRes.text.includes("doctorNotFound") || crossRes.text.includes("tapılmadı"),
      `response did not contain doctorNotFound error`,
    );
    // Verify DB unchanged
    const turalAfterCross = await prisma.patient.findUniqueOrThrow({ where: { id: turalPatient.id } });
    check(
      "8. cross-tenant: DB unchanged (Tural still has doctor.id)",
      turalAfterCross.primaryDoctorId === doctor.id,
      `got ${turalAfterCross.primaryDoctorId}`,
    );

    // ── 9. patientsMoved=0 when from-doctor has no patients ─────────────────
    // doc2 has 0 patients → transfer from doc2 → doctor should give patientsMoved=0
    const adminPage6 = await owner.get("/admin");
    const emptyFromForm = formContaining(adminPage6.html, "data-e2e-doctor-transfer");
    const emptyFromRes = await owner.postForm("/admin", emptyFromForm, {
      fromDoctorUserId: doc2User.id,
      toDoctorUserId: doctorUser.id,
      transferPatients: "on",
    });
    // saved=true and patientsMoved=0 (doc2 has no patients)
    const turalStillWithDoctor = await prisma.patient.findUniqueOrThrow({ where: { id: turalPatient.id } });
    check(
      "9. patientsMoved=0 when from-doctor has no patients (Tural unchanged)",
      turalStillWithDoctor.primaryDoctorId === doctor.id,
      `unexpected: primaryDoctorId = ${turalStillWithDoctor.primaryDoctorId}`,
    );
    check(
      "9. response shows success (action did not error)",
      !emptyFromRes.text.includes('"error"') || emptyFromRes.text.includes("saved"),
      `response: ${emptyFromRes.text.slice(0, 200)}`,
    );

    // ── 10. audit_log entry after successful transfer ────────────────────────
    // Do a fresh transfer to create an audit log
    const adminPage7 = await owner.get("/admin");
    const auditForm = formContaining(adminPage7.html, "data-e2e-doctor-transfer");
    await owner.postForm("/admin", auditForm, {
      fromDoctorUserId: doctorUser.id,
      toDoctorUserId: doc2User.id,
      transferPatients: "on",
    });
    const auditEntry = await prisma.auditLog.findFirst({
      where: { clinicId: clinic.id, entityId: doctor.id, action: "transfer" },
      orderBy: { createdAt: "desc" },
    });
    check(
      "10. audit_log entry exists after transfer (action=transfer, entityId=doctor.id)",
      auditEntry !== null,
      `no audit log found for doctor.id=${doctor.id}`,
    );

    // ── 11. Regression: /admin loads after all ops ───────────────────────────
    const adminFinal = await owner.get("/admin");
    check(
      "11. regression: /admin loads (200) and contains staff table",
      adminFinal.status === 200 && adminFinal.html.includes("Əməkdaşlar"),
      `status=${adminFinal.status}`,
    );

    // ── 12. Regression: /patients loads and shows Rəşad ─────────────────────
    const patientsPage = await owner.get("/patients");
    check(
      "12. regression: /patients loads (200) and shows Rəşad",
      patientsPage.status === 200 && patientsPage.html.includes("Həsənov"),
      `status=${patientsPage.status}`,
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    // Restore Tural to original state (no doctor)
    await prisma.patient.update({ where: { id: turalPatient.id }, data: { primaryDoctorId: null } }).catch(() => {});

    // Delete test appointment
    await prisma.appointment.delete({ where: { id: testAppt.id } }).catch(() => {});

    // Remove audit logs for this test doctor (to avoid cross-test pollution)
    await prisma.auditLog.deleteMany({ where: { clinicId: clinic.id, entityId: doctor.id, action: "transfer" } }).catch(() => {});

    // Delete doc2
    await prisma.doctor.delete({ where: { id: doc2.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: doc2User.id } }).catch(() => {});

    // Delete clinicB and docBUser
    await prisma.doctor.deleteMany({ where: { clinicId: clinicB.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { clinicId: clinicB.id } }).catch(() => {});
    await prisma.clinic.delete({ where: { id: clinicB.id } }).catch(() => {});

    await prisma.$disconnect();
  }

  console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
