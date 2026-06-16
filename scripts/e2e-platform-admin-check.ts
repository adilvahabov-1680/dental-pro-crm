/**
 * E2E-проверка Platform Admin v1 (сессия 24, dev-скрипт):
 *   npx tsx scripts/e2e-platform-admin-check.ts
 * Требует dev-сервер + seed. 18 проверок:
 * доступ super_admin к /platform, создание клиники, управление пользователями,
 * смена пароля/логина, блокировка suspended клиники, tenant-изоляция, регрессия.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
const E2E_PASS = "E2eTest9999!";
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, text: await res.text() };
  }
  async login(email: string, password = PASSWORD) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password });
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
  console.log(`E2E platform-admin check → ${BASE}\n`);

  const superUser = await prisma.user.findFirstOrThrow({ where: { email: "super@demo.dentalpro.az" } });
  const demoClinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const receptionRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "reception" } });

  const ts = Date.now();
  const testAdminEmail = `e2e-platform-admin-${ts}@test.dentalpro.az`;
  const testStaffEmail = `e2e-platform-staff-${ts}@test.dentalpro.az`;
  const testClinicAdminEmail = `e2e-clinic2-admin-${ts}@test.dentalpro.az`;

  // ── Setup: test clinic A + admin + staff (for password/login/tenant tests) ──
  const testClinic = await prisma.clinic.create({
    data: { name: `E2E Test Clinic ${ts}`, slug: `e2e-test-clinic-${ts}`, status: "active" },
  });
  const testAdmin = await prisma.user.create({
    data: {
      clinicId: testClinic.id,
      roleId: ownerRole.id,
      email: testAdminEmail,
      fullName: "E2E Test Admin",
      passwordHash: await bcrypt.hash(E2E_PASS, 10),
      locale: "az",
    },
  });
  const testStaff = await prisma.user.create({
    data: {
      clinicId: testClinic.id,
      roleId: receptionRole.id,
      email: testStaffEmail,
      fullName: "E2E Test Staff",
      passwordHash: await bcrypt.hash(E2E_PASS, 10),
      locale: "az",
    },
  });

  // ── Setup: clinic B (cross-tenant isolation) ──────────────────────────────
  const clinicB = await prisma.clinic.create({
    data: { name: `E2E Clinic B ${ts}`, slug: `e2e-clinic-b-${ts}`, status: "active" },
  });
  const clinicBAdmin = await prisma.user.create({
    data: {
      clinicId: clinicB.id,
      roleId: ownerRole.id,
      email: `e2e-clinic-b-admin-${ts}@test.dentalpro.az`,
      fullName: "E2E Clinic B Admin",
      passwordHash: await bcrypt.hash(E2E_PASS, 10),
      locale: "az",
    },
  });

  let createdClinicId: string | undefined;
  let loginChangedUserId: string | undefined;
  let newEmailAfterChange: string | undefined;

  try {
    // ── 1. super_admin can login ─────────────────────────────────────────────
    console.log("── Checks 1-3: access control ──");
    const superSession = new Session();
    check("1. super_admin login (alias 'super')", await superSession.login("super"));

    // ── 2. super_admin can access /platform/clinics ──────────────────────────
    const platformPage = await superSession.get("/platform/clinics");
    check("2. super_admin: /platform/clinics → 200", platformPage.status === 200);
    check("2b. /platform/clinics contains clinic list", platformPage.html.includes("demo-klinika") || platformPage.html.includes("Demo Klinika") || platformPage.html.includes("Klinikalar"));

    // ── 3. clinic admin cannot access /platform/clinics ──────────────────────
    const clinicAdminSession = new Session();
    check("3a. testAdmin login", await clinicAdminSession.login(testAdminEmail, E2E_PASS));
    const platformAsClinicAdmin = await clinicAdminSession.get("/platform/clinics");
    check(
      "3. clinic admin: /platform/clinics → redirect (not super_admin)",
      platformAsClinicAdmin.status >= 300 && platformAsClinicAdmin.status < 400,
    );

    // ── 4. super_admin creates clinic (via HTTP action) ──────────────────────
    console.log("\n── Checks 4-6: clinic creation ──");
    const createForm = formContaining(platformPage.html, "data-e2e-create-clinic");
    check("4a. CreateClinicForm found in /platform/clinics HTML", createForm.length > 0);
    const newClinicName = `E2E Created ${ts}`;
    const newAdminEmail = testClinicAdminEmail;
    const newAdminPass = "NewAdmin99!";
    const createRes = await superSession.postForm("/platform/clinics", createForm, {
      name: newClinicName,
      clinicType: "clinic",
      phone: "",
      email: "",
      address: "",
      adminName: "E2E Created Admin",
      adminEmail: newAdminEmail,
      adminPassword: newAdminPass,
    });
    check("4. createClinic action: response OK", createRes.status < 400);
    const createdClinic = await prisma.clinic.findFirst({ where: { name: newClinicName } });
    check("4b. created clinic exists in DB", !!createdClinic);
    createdClinicId = createdClinic?.id;

    // ── 5. initial clinic admin was created ──────────────────────────────────
    const createdAdmin = await prisma.user.findUnique({
      where: { email: newAdminEmail },
      include: { role: true },
    });
    check("5a. initial admin user created in DB", !!createdAdmin);
    check("5b. initial admin has owner role", createdAdmin?.role.key === "owner");
    check("5c. initial admin belongs to created clinic", createdAdmin?.clinicId === createdClinic?.id);

    // ── 6. new clinic admin can login ────────────────────────────────────────
    const newAdminSession = new Session();
    check("6. new clinic admin can login", await newAdminSession.login(newAdminEmail, newAdminPass));

    // ── 7. clinic admin sees own users, not other clinic ─────────────────────
    console.log("\n── Checks 7-8: tenant isolation ──");
    const adminPage = await clinicAdminSession.get("/admin");
    check("7a. testAdmin: /admin → 200", adminPage.status === 200);
    check("7b. /admin shows own staff (testStaff)", adminPage.html.includes("E2E Test Staff"));
    check("7c. /admin does NOT show other clinic staff", !adminPage.html.includes("E2E Clinic B Admin"));

    // ── 8. clinic admin cannot manage other clinic's users ───────────────────
    const clinicBAdminPage = await clinicAdminSession.get("/admin");
    // The resetStaffPassword form for clinicBAdmin should not appear in testAdmin's /admin
    check(
      "8. testAdmin: clinicBAdmin user ID not in own /admin page",
      !clinicBAdminPage.html.includes(clinicBAdmin.id),
    );

    // ── 9. clinic admin resets password for same-clinic user ─────────────────
    console.log("\n── Checks 9-12: password/login management ──");
    const adminPage2 = await clinicAdminSession.get("/admin");
    const resetFormAdmin = formContaining(adminPage2.html, `data-e2e-admin-reset="${testStaff.id}"`);
    check("9a. resetPassword form found in /admin for testStaff", resetFormAdmin.length > 0);
    const newPass = "Reset1111!";
    const resetByAdminRes = await clinicAdminSession.postForm("/admin", resetFormAdmin, {
      userId: testStaff.id,
      newPassword: newPass,
    });
    check("9. clinic admin resets password: response OK", resetByAdminRes.status < 400);
    const staffLoginAfterReset = new Session();
    check("9b. testStaff can login with new password", await staffLoginAfterReset.login(testStaffEmail, newPass));

    // ── 10. super_admin resets password for any clinic user ──────────────────
    const clinicDetailPage = await superSession.get(`/platform/clinics/${testClinic.id}`);
    check("10a. super: /platform/clinics/[id] → 200", clinicDetailPage.status === 200);
    const resetFormPlatform = formContaining(clinicDetailPage.html, `data-e2e-platform-reset="${testAdmin.id}"`);
    check("10b. platformResetPassword form found for testAdmin", resetFormPlatform.length > 0);
    const superNewPass = "SuperReset22!";
    const resetBySuperRes = await superSession.postForm(`/platform/clinics/${testClinic.id}`, resetFormPlatform, {
      userId: testAdmin.id,
      newPassword: superNewPass,
    });
    check("10. super resets password: response OK", resetBySuperRes.status < 400);
    const adminLoginAfterReset = new Session();
    check("10c. testAdmin can login with super-reset password", await adminLoginAfterReset.login(testAdminEmail, superNewPass));

    // ── 11. login/email update works ─────────────────────────────────────────
    const clinicDetailPage2 = await superSession.get(`/platform/clinics/${testClinic.id}`);
    const loginChangeForm = formContaining(clinicDetailPage2.html, `data-e2e-platform-login-change="${testStaff.id}"`);
    check("11a. platformChangeLogin form found for testStaff", loginChangeForm.length > 0);
    newEmailAfterChange = `e2e-changed-${ts}@test.dentalpro.az`;
    loginChangedUserId = testStaff.id;
    const changeLoginRes = await superSession.postForm(`/platform/clinics/${testClinic.id}`, loginChangeForm, {
      userId: testStaff.id,
      newEmail: newEmailAfterChange,
    });
    check("11. changeLogin: response OK", changeLoginRes.status < 400);
    const staffWithNewEmail = await prisma.user.findUnique({ where: { email: newEmailAfterChange } });
    check("11b. staff email updated in DB", staffWithNewEmail?.id === testStaff.id);

    // ── 12. old login fails after login change ───────────────────────────────
    const oldLoginSession = new Session();
    check("12. old email fails to login after change", !(await oldLoginSession.login(testStaffEmail, newPass)));
    const newLoginSession = new Session();
    check("12b. new email works for login", await newLoginSession.login(newEmailAfterChange, newPass));

    // ── 13. cannot deactivate last active admin/owner ────────────────────────
    console.log("\n── Checks 13-15: security constraints ──");
    const clinicDetailPage3 = await superSession.get(`/platform/clinics/${testClinic.id}`);
    // testAdmin is the only owner in testClinic — toggle should fail with lastAdmin
    const toggleForm = formContaining(clinicDetailPage3.html, `name="userId" value="${testAdmin.id}"`);
    check("13a. toggleStatus form found for testAdmin", toggleForm.length > 0);
    const toggleRes = await superSession.postForm(`/platform/clinics/${testClinic.id}`, toggleForm, {
      userId: testAdmin.id,
    });
    check("13. toggle last admin: response OK (no crash)", toggleRes.status < 400);
    check("13b. response contains lastAdmin error", toggleRes.text.includes("lastAdmin"));
    const adminAfterToggle = await prisma.user.findUniqueOrThrow({ where: { id: testAdmin.id } });
    check("13c. testAdmin remains active (DB)", adminAfterToggle.isActive === true);

    // ── 14. clinic admin cannot edit super_admin ──────────────────────────────
    const adminPage3 = await clinicAdminSession.get("/admin");
    check("14. super_admin user ID not in clinic /admin page", !adminPage3.html.includes(superUser.id));

    // ── 15. audit_log entries for password reset / login change ──────────────
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: "user", entityId: { in: [testAdmin.id, testStaff.id] } },
    });
    check(
      "15a. audit_log: password reset entry for testAdmin",
      auditEntries.some((a) => a.entityId === testAdmin.id && JSON.stringify(a.after).includes("passwordReset")),
    );
    check(
      "15b. audit_log: login change entry for testStaff",
      auditEntries.some((a) => a.entityId === testStaff.id && JSON.stringify(a.after).includes(newEmailAfterChange!)),
    );

    // ── 16. suspended clinic login blocked ───────────────────────────────────
    console.log("\n── Checks 16: clinic suspension ──");
    await prisma.clinic.update({ where: { id: testClinic.id }, data: { status: "suspended" } });
    const suspendedLoginSession = new Session();
    const loginPage = await suspendedLoginSession.get("/login");
    const loginRes = await suspendedLoginSession.postForm("/login", loginPage.html, {
      email: testAdminEmail,
      password: superNewPass,
    });
    check(
      "16. suspended clinic login blocked (clinicSuspended in response or no session)",
      loginRes.text.includes("clinicSuspended") || !suspendedLoginSession.cookies.has("dp_session"),
    );
    // Reactivate for cleanup
    await prisma.clinic.update({ where: { id: testClinic.id }, data: { status: "active" } });

    // ── 17-18. regression ─────────────────────────────────────────────────────
    console.log("\n── Checks 17-18: regression ──");
    const demoAdmin = new Session();
    check("17. demo admin login", await demoAdmin.login("admin@demo.dentalpro.az"));
    const demoAdminPage = await demoAdmin.get("/admin");
    check("17b. /admin loads for demo admin", demoAdminPage.status === 200);
    check("17c. demo admin: /platform/clinics redirect (not super)", (await demoAdmin.get("/platform/clinics")).status >= 300);

    const aliasSession = new Session();
    check("18. demo alias 'admin' login still works", await aliasSession.login("admin"));
    check("18b. /dashboard accessible after alias login", (await aliasSession.get("/dashboard")).status === 200);

    // Also verify demo clinic patients page (catch-all regression)
    check("regression: /patients loads for demo admin", (await demoAdmin.get("/patients")).status === 200);
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────────
    const userIds = [testAdmin.id, testStaff.id, clinicBAdmin.id];
    // Also clean up the clinic created via HTTP action
    if (createdClinicId) {
      const createdUsers = await prisma.user.findMany({
        where: { clinicId: createdClinicId },
        select: { id: true },
      });
      userIds.push(...createdUsers.map((u) => u.id));
      await prisma.auditLog.deleteMany({ where: { entityType: "user", entityId: { in: createdUsers.map((u) => u.id) } } });
      await prisma.user.deleteMany({ where: { clinicId: createdClinicId } });
      await prisma.auditLog.deleteMany({ where: { entityType: "clinic", entityId: createdClinicId } });
      await prisma.clinic.delete({ where: { id: createdClinicId } }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({ where: { entityType: "user", entityId: { in: [testAdmin.id, testStaff.id, clinicBAdmin.id] } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "clinic", entityId: { in: [testClinic.id, clinicB.id] } } });
    // Delete users (staff email may have changed)
    const staffCurrentEmail = newEmailAfterChange ?? testStaffEmail;
    await prisma.user.deleteMany({ where: { email: { in: [testAdminEmail, staffCurrentEmail, clinicBAdmin.email] } } });
    await prisma.user.deleteMany({ where: { id: { in: [testAdmin.id, testStaff.id, clinicBAdmin.id] } } });
    await prisma.clinic.delete({ where: { id: testClinic.id } }).catch(() => {});
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
