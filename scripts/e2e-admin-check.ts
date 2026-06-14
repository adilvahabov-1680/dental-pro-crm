/**
 * E2E-проверка Admin v1 (сессия 17, dev-скрипт):
 *   npx tsx scripts/e2e-admin-check.ts
 * Требует dev-сервер + seed. Проверяет: доступ к /admin (admin.view),
 * tenant-изоляцию списка кадров, смену роли (admin.manage), self-lockout
 * (последний owner/admin, самодеактивация), деактивацию/реактивацию,
 * audit_log, создание сотрудника, и регрессию логина/dashboard.
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
    return { status: res.status, location: res.headers.get("location") ?? undefined, text: await res.text() };
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
  console.log(`E2E admin check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const ownerUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });
  const receptionRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "reception" } });

  // ── временный e2e-сотрудник (role: reception) для role-change/status тестов ──
  const e2eUser = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      roleId: receptionRole.id,
      email: `e2e-admin-staff-${Date.now()}@demo.dentalpro.az`,
      fullName: "E2E Admin Staff",
      passwordHash: "x",
      locale: "az",
    },
  });

  // ── чужая клиника + пользователь (cross-tenant) ──────────────────────────
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-admin-clinic-b" },
    update: {},
    create: { name: "E2E Admin B", slug: "e2e-admin-clinic-b", status: "active" },
  });
  const userB = await prisma.user.create({
    data: {
      clinicId: clinicB.id,
      roleId: receptionRole.id,
      email: `e2e-admin-clinicb-${Date.now()}@demo.dentalpro.az`,
      fullName: "ZzForeign Staff",
      passwordHash: "x",
      locale: "az",
    },
  });

  let createdStaffEmail: string | undefined;

  try {
    // ── 1. owner/admin может открыть /admin ────────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));
    const adminPage = await owner.get("/admin");
    check("owner: /admin доступен (200)", adminPage.status === 200);
    check("owner: страница содержит «Əməkdaşlar»", adminPage.html.includes("Əməkdaşlar"));
    check("owner: nav содержит /admin", adminPage.html.includes('href="/admin"'));

    // ── 2. non-admin не может открыть /admin ──────────────────────────────
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    const adminAsDoctor = await hekim.get("/admin");
    check(
      "doctor: /admin → redirect /dashboard (нет admin.view)",
      adminAsDoctor.status >= 300 && adminAsDoctor.status < 400 && adminAsDoctor.location === "/dashboard",
    );
    const dashAsDoctor = await hekim.get("/dashboard");
    check("doctor: nav НЕ содержит /admin", !dashAsDoctor.html.includes('href="/admin"'));

    const assistant = new Session();
    check("login assistant", await assistant.login("assistent@demo.dentalpro.az"));
    const adminAsAssistant = await assistant.get("/admin");
    check(
      "assistant: /admin → redirect /dashboard",
      adminAsAssistant.status >= 300 && adminAsAssistant.status < 400 && adminAsAssistant.location === "/dashboard",
    );

    // ── 3/4. список кадров — только текущая клиника, cross-tenant скрыт ────
    check(
      "staff list: видны seed-пользователи клиники (admin/hekim/assistent)",
      adminPage.html.includes("Aysel Məmmədova") &&
        adminPage.html.includes("Dr. Elvin Quliyev") &&
        adminPage.html.includes("Nigar Əliyeva"),
    );
    check("staff list: видна e2e-сотрудница (E2E Admin Staff)", adminPage.html.includes("E2E Admin Staff"));
    check("staff list: чужой клиники (ZzForeign Staff) не видно", !adminPage.html.includes("ZzForeign Staff"));

    // ── 5. admin меняет роль другого пользователя ───────────────────────────
    const roleForm = formContaining(adminPage.html, `data-staff-role="${e2eUser.id}"`);
    check("найдена форма смены роли для e2e-сотрудника", roleForm.length > 0);
    const roleChangeRes = await owner.postForm("/admin", roleForm, { userId: e2eUser.id, roleKey: "accountant" });
    check("role change: запрос успешен (не redirect на /login)", roleChangeRes.status < 400);
    const afterRoleChange = await prisma.user.findUniqueOrThrow({
      where: { id: e2eUser.id },
      include: { role: true },
    });
    check("role change: роль e2e-сотрудника → accountant", afterRoleChange.role.key === "accountant");

    // ── 6. non-admin не может вызвать смену роли напрямую ───────────────────
    const adminPage2 = await owner.get("/admin");
    const roleForm2 = formContaining(adminPage2.html, `data-staff-role="${e2eUser.id}"`);
    const bypassRes = await assistant.postForm("/admin", roleForm2, { userId: e2eUser.id, roleKey: "owner" });
    check(
      "assistant: вызов смены роли → redirect /dashboard (нет admin.manage)",
      bypassRes.status >= 300 && bypassRes.status < 400 && bypassRes.location === "/dashboard",
    );
    const afterBypass = await prisma.user.findUniqueOrThrow({ where: { id: e2eUser.id }, include: { role: true } });
    check("assistant bypass: роль e2e-сотрудника НЕ изменилась", afterBypass.role.key === "accountant");

    // ── 7. owner не может разжаловать себя, если останется без admin ────────
    const selfRoleForm = formContaining(adminPage2.html, `data-staff-role="${ownerUser.id}"`);
    check("найдена форма смены роли для самого owner", selfRoleForm.length > 0);
    const selfDemoteRes = await owner.postForm("/admin", selfRoleForm, { userId: ownerUser.id, roleKey: "doctor" });
    check("self-demote: запрос успешен (не redirect)", selfDemoteRes.status < 400);
    check("self-demote: ответ содержит ошибку lastAdmin", selfDemoteRes.text.includes("lastAdmin"));
    const ownerAfter = await prisma.user.findUniqueOrThrow({ where: { id: ownerUser.id }, include: { role: true } });
    check("self-demote: роль owner НЕ изменилась", ownerAfter.role.key === "owner");

    // ── 8. деактивация / реактивация e2e-сотрудника ─────────────────────────
    const toggleForm = formContaining(adminPage2.html, `data-staff-toggle="${e2eUser.id}"`);
    check("найдена форма статуса для e2e-сотрудника", toggleForm.length > 0);
    await owner.postForm("/admin", toggleForm, { userId: e2eUser.id });
    const afterDeactivate = await prisma.user.findUniqueOrThrow({ where: { id: e2eUser.id } });
    check("status toggle: e2e-сотрудник деактивирован", afterDeactivate.isActive === false);

    const adminPage3 = await owner.get("/admin");
    const toggleForm2 = formContaining(adminPage3.html, `data-staff-toggle="${e2eUser.id}"`);
    await owner.postForm("/admin", toggleForm2, { userId: e2eUser.id });
    const afterReactivate = await prisma.user.findUniqueOrThrow({ where: { id: e2eUser.id } });
    check("status toggle: e2e-сотрудник реактивирован", afterReactivate.isActive === true);

    // ── self-deactivation запрещена ─────────────────────────────────────────
    const adminPage4 = await owner.get("/admin");
    check("owner: своя строка без кнопки статуса", !adminPage4.html.includes(`data-staff-toggle="${ownerUser.id}"`));

    // ── 9. audit_log для role/status изменений ──────────────────────────────
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: "user", entityId: e2eUser.id },
      orderBy: { createdAt: "asc" },
    });
    check("audit_log: запись о смене роли", auditEntries.some((a) => JSON.stringify(a.after).includes("accountant")));
    check(
      "audit_log: записи о деактивации/реактивации",
      auditEntries.filter((a) => JSON.stringify(a.after).includes("isActive")).length >= 2,
    );

    // ── создание сотрудника (create-user v1) ─────────────────────────────────
    const adminPage5 = await owner.get("/admin");
    const createForm = formContaining(adminPage5.html, "data-staff-create");
    check("найдена форма создания сотрудника", createForm.length > 0);
    createdStaffEmail = `e2e-admin-new-${Date.now()}@demo.dentalpro.az`;
    const createRes = await owner.postForm("/admin", createForm, {
      fullName: "E2E New Staff",
      email: createdStaffEmail,
      phone: "",
      roleKey: "reception",
    });
    check("create staff: запрос успешен", createRes.status < 400);
    const newStaff = await prisma.user.findUnique({ where: { email: createdStaffEmail }, include: { role: true } });
    check("create staff: пользователь создан в БД", !!newStaff && newStaff.clinicId === clinic.id);
    check("create staff: роль reception", newStaff?.role.key === "reception");
    check("create staff: isActive=true", newStaff?.isActive === true);

    // ── 10. регрессия логина / dashboard ─────────────────────────────────────
    check("/dashboard открывается (owner)", (await owner.get("/dashboard")).status === 200);
    check("/dashboard открывается (doctor)", (await hekim.get("/dashboard")).status === 200);
    check("/dashboard открывается (assistant)", (await assistant.get("/dashboard")).status === 200);
    check("/patients открывается (owner)", (await owner.get("/patients")).status === 200);
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityType: "user", entityId: { in: [e2eUser.id, userB.id] } } });
    if (createdStaffEmail) {
      const created = await prisma.user.findUnique({ where: { email: createdStaffEmail } });
      if (created) {
        await prisma.auditLog.deleteMany({ where: { entityType: "user", entityId: created.id } });
        await prisma.user.delete({ where: { id: created.id } }).catch(() => {});
      }
    }
    await prisma.user.delete({ where: { id: e2eUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
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
