/**
 * E2E-проверка Bildirişlər UI (dev-скрипт):
 *   npx tsx scripts/e2e-notifications-check.ts
 * Требует dev-сервер + seed. Проверяет: страницу, bell-счётчик,
 * mark read / mark all read, изоляцию tenant'а и permissions.
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
  async postForm(path: string, pageHtml: string, fields: Record<string, string | string[]>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) for (const item of v) fd.append(k, item);
      else fd.set(k, v);
    }
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

/** Фрагмент html вокруг конкретного notification (для form-specific $ACTION). */
function notificationFragment(html: string, id: string): string {
  const start = html.indexOf(`data-notification="${id}"`);
  if (start < 0) return "";
  const end = html.indexOf("</li>", start);
  return html.slice(start, end < 0 ? undefined : end);
}

/**
 * Unread-счётчик из bell в topbar (data-testid="topbar-bell") — 0, если
 * самого bell нет (нет notifications.view) или badge не отрендерился (unread=0,
 * span условно не рендерится вовсе, см. Topbar.tsx). "99+" не встречается в
 * e2e-объёмах, поэтому маппится в 100 — только для относительных delta-сравнений.
 */
function scrapeUnreadCount(html: string): number {
  const bellIdx = html.indexOf('data-testid="topbar-bell"');
  if (bellIdx < 0) return 0;
  const linkEnd = html.indexOf("</a>", bellIdx);
  const fragment = html.slice(bellIdx, linkEnd < 0 ? bellIdx + 500 : linkEnd);
  const m = fragment.match(/>(\d+|99\+)<\/span>/);
  if (!m) return 0;
  return m[1] === "99+" ? 100 : Number(m[1]);
}

/** Фрагмент формы «Hamısını oxundu et» (для повторного использования $ACTION). */
function markAllFragment(html: string): string {
  const btnIdx = html.indexOf("Hamısını oxundu et");
  if (btnIdx < 0) return "";
  const start = html.lastIndexOf("<form", btnIdx);
  const end = html.indexOf("</form>", btnIdx);
  return start < 0 || end < 0 ? "" : html.slice(start, end);
}

async function main() {
  console.log(`E2E notifications check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.dentalpro.az" } });

  // сброс артефактов прошлых прогонов
  await prisma.notification.deleteMany({
    where: { body: { startsWith: "e2e-notif" } },
  });
  await prisma.user.deleteMany({ where: { email: "e2e-notif-restricted@e2e.local" } });

  // тестовые notifications: 2 непрочитанных tenant-level low_stock в клинике A
  const n1 = await prisma.notification.create({
    data: {
      clinicId: clinic.id,
      channel: "in_app",
      type: "inventory_low_stock",
      body: "e2e-notif: Material az qalıb: E2E Material 1",
      scheduledAt: new Date(),
    },
  });
  const n2 = await prisma.notification.create({
    data: {
      clinicId: clinic.id,
      channel: "in_app",
      type: "inventory_low_stock",
      body: "e2e-notif: Material az qalıb: E2E Material 2",
      scheduledAt: new Date(),
    },
  });

  // чужая клиника + её notification
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-notif-clinic-b" },
    update: {},
    create: { name: "E2E Notif B", slug: "e2e-notif-clinic-b", status: "active" },
  });
  const nForeign = await prisma.notification.create({
    data: {
      clinicId: clinicB.id,
      channel: "in_app",
      type: "inventory_low_stock",
      body: "e2e-notif-foreign: Material az qalıb: Foreign Material",
      scheduledAt: new Date(),
    },
  });

  try {
    // ── owner ────────────────────────────────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // 9. страница открывается, low-stock notification виден
    const page = await owner.get("/notifications");
    check("страница /notifications открывается",
      page.status === 200 && page.html.includes("Bildirişlər"));
    check("low-stock notification виден", page.html.includes("E2E Material 1"));

    // 10. unread count виден (бейдж на странице + bell в topbar)
    const unreadDb = await prisma.notification.count({
      where: { clinicId: clinic.id, channel: "in_app", status: { not: "read" } },
    });
    check("unread-бейдж на странице", page.html.includes("oxunmamış"));
    check("bell в topbar со счётчиком",
      page.html.includes("topbar-bell") && page.html.includes(`>${unreadDb > 99 ? "99+" : unreadDb}<`),
      `db unread=${unreadDb}`);

    // 14. чужой notification не виден
    check("чужой notification не виден", !page.html.includes("Foreign Material"));

    // 12. mark one as read
    const frag = notificationFragment(page.html, n1.id);
    check("форма mark-read у notification есть", frag.includes(`value="${n1.id}"`));
    await owner.postForm("/notifications", frag, { id: n1.id });
    const n1After = await prisma.notification.findUniqueOrThrow({ where: { id: n1.id } });
    check("mark one as read работает", n1After.status === "read");
    const n2Mid = await prisma.notification.findUniqueOrThrow({ where: { id: n2.id } });
    check("второй notification остался непрочитанным", n2Mid.status !== "read");

    // 14b. чужой notification нельзя отметить read (id подменён)
    await owner.postForm("/notifications", frag, { id: nForeign.id });
    const foreignAfter = await prisma.notification.findUniqueOrThrow({ where: { id: nForeign.id } });
    check("чужой notification mark-read блокирован", foreignAfter.status !== "read");

    // 13. mark all as read — точный фрагмент формы (на странице есть и другие
    // server-action формы, их $ACTION-поля не должны попасть в POST)
    const page2 = await owner.get("/notifications");
    const btnIdx = page2.html.indexOf("Hamısını oxundu et");
    const allFrag = page2.html.slice(
      page2.html.lastIndexOf("<form", btnIdx),
      page2.html.indexOf("</form>", btnIdx),
    );
    await owner.postForm("/notifications", allFrag, {});
    const unreadAfterAll = await prisma.notification.count({
      where: { clinicId: clinic.id, channel: "in_app", status: { not: "read" } },
    });
    check("mark all as read работает", unreadAfterAll === 0, `left ${unreadAfterAll}`);
    const foreignStill = await prisma.notification.findUniqueOrThrow({ where: { id: nForeign.id } });
    check("mark all не трогает чужой tenant", foreignStill.status !== "read");

    // ── assistant: нет notifications.view ────────────────────────────
    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    const asstPage = await asst.get("/notifications");
    check("assistant: /notifications недоступна",
      asstPage.status === 307 || asstPage.status === 303 || !asstPage.html.includes("E2E Material"));
    const asstDash = await asst.get("/dashboard");
    check("assistant: bell в topbar скрыт", !asstDash.html.includes("topbar-bell"));

    // ── doctor: видит tenant-level low_stock (есть inventory.view) ───
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    const hekimPage = await hekim.get("/notifications");
    check("doctor: видит low-stock notifications", hekimPage.html.includes("E2E Material 2"));

    // ── Permission map coverage (Session 46): reschedule_offer / feedback_received / repeat_visit_reminder ──
    console.log("\nPermission map coverage (Session 46)");

    // restricted: role=reception (по умолчанию есть appointments.view + patients.view +
    // notifications.view), затем personal-deny именно на appointments.view/patients.view —
    // даёт пользователя, который МОЖЕТ открыть /notifications (notifications.view остался),
    // но не должен видеть типы, завязанные на appointments.view/patients.view. Так
    // изолированно проверяется именно TYPE_PERMISSION-фильтрация, а не внешний page-gate
    // (assistant/accountant не имеют notifications.view вовсе и были бы редиректнуты раньше,
    // не дойдя до этой логики — это другой, уже покрытый кейс, см. выше).
    const receptionRole = await prisma.role.findFirstOrThrow({ where: { key: "reception", clinicId: null } });
    const apptViewPerm = await prisma.permission.findFirstOrThrow({ where: { key: "appointments.view" } });
    const patientsViewPerm = await prisma.permission.findFirstOrThrow({ where: { key: "patients.view" } });
    const restrictedUser = await prisma.user.create({
      data: {
        email: "e2e-notif-restricted@e2e.local",
        fullName: "E2E Notif Restricted",
        clinicId: clinic.id,
        roleId: receptionRole.id,
        passwordHash: adminUser.passwordHash,
      },
    });
    await prisma.userPermission.createMany({
      data: [
        { userId: restrictedUser.id, permissionId: apptViewPerm.id, allowed: false },
        { userId: restrictedUser.id, permissionId: patientsViewPerm.id, allowed: false },
      ],
    });
    const restricted = new Session();
    check("perm0: restricted user login", await restricted.login("e2e-notif-restricted@e2e.local"));
    const restrictedPageBefore = await restricted.get("/notifications");
    check("perm1: restricted user CAN open /notifications (keeps notifications.view)", restrictedPageBefore.status === 200);
    const restrictedUnreadBefore = scrapeUnreadCount(restrictedPageBefore.html);

    const ownerPageBefore = await owner.get("/notifications");
    const ownerUnreadBefore = scrapeUnreadCount(ownerPageBefore.html);

    const nReschedule = await prisma.notification.create({
      data: { clinicId: clinic.id, channel: "in_app", type: "reschedule_offer", body: "e2e-notif: reschedule_offer test", scheduledAt: new Date() },
    });
    const nFeedback = await prisma.notification.create({
      data: { clinicId: clinic.id, channel: "in_app", type: "feedback_received", body: "e2e-notif: feedback_received test", scheduledAt: new Date() },
    });
    const nRepeatVisit = await prisma.notification.create({
      data: { clinicId: clinic.id, channel: "in_app", type: "repeat_visit_reminder", body: "e2e-notif: repeat_visit_reminder test", scheduledAt: new Date() },
    });

    // A/B/C — owner (appointments.view + patients.view) видит все три
    const ownerPageAfter = await owner.get("/notifications");
    check("A1: owner (appointments.view) видит reschedule_offer", ownerPageAfter.html.includes("e2e-notif: reschedule_offer test"));
    check("A2: метка типа reschedule_offer отрендерена", ownerPageAfter.html.includes("Vaxt variantı təklifi"));
    check("B1: owner (patients.view) видит feedback_received", ownerPageAfter.html.includes("e2e-notif: feedback_received test"));
    check("C1: owner (appointments.view) видит repeat_visit_reminder", ownerPageAfter.html.includes("e2e-notif: repeat_visit_reminder test"));

    // D — unread-счётчик владельца увеличился ровно на 3 (видны все три типа)
    const ownerUnreadAfter = scrapeUnreadCount(ownerPageAfter.html);
    check("D1: unread-счётчик owner увеличился ровно на 3", ownerUnreadAfter === ownerUnreadBefore + 3,
      `before=${ownerUnreadBefore} after=${ownerUnreadAfter}`);

    // A/B/C (negative) — restricted (без appointments.view/patients.view) не видит ни один из трёх
    const restrictedPageAfter = await restricted.get("/notifications");
    check("A3: restricted (без appointments.view) НЕ видит reschedule_offer", !restrictedPageAfter.html.includes("e2e-notif: reschedule_offer test"));
    check("B2: restricted (без patients.view) НЕ видит feedback_received", !restrictedPageAfter.html.includes("e2e-notif: feedback_received test"));
    check("C2: restricted (без appointments.view) НЕ видит repeat_visit_reminder", !restrictedPageAfter.html.includes("e2e-notif: repeat_visit_reminder test"));

    // D (negative) — unread-счётчик restricted не изменился (все три вне его scope)
    const restrictedUnreadAfter = scrapeUnreadCount(restrictedPageAfter.html);
    check("D2: unread-счётчик restricted не изменился (delta 0)", restrictedUnreadAfter === restrictedUnreadBefore,
      `before=${restrictedUnreadBefore} after=${restrictedUnreadAfter}`);

    // E — mark-all-read от restricted не трогает уведомления вне его scope (architecture уже
    // корректна: markAllNotificationsRead применяет notificationScopeWhere(user) в updateMany —
    // никакого редизайна не требуется, проверяем существующее поведение).
    const markAllFrag = markAllFragment(ownerPageAfter.html);
    check("E0: форма «Hamısını oxundu et» найдена (harvested у owner)", !!markAllFrag);
    await restricted.postForm("/notifications", markAllFrag, {});
    const [nRescheduleMid, nFeedbackMid, nRepeatVisitMid] = await Promise.all([
      prisma.notification.findUniqueOrThrow({ where: { id: nReschedule.id } }),
      prisma.notification.findUniqueOrThrow({ where: { id: nFeedback.id } }),
      prisma.notification.findUniqueOrThrow({ where: { id: nRepeatVisit.id } }),
    ]);
    check("E1: restricted mark-all-read не трогает reschedule_offer (вне scope)", nRescheduleMid.status !== "read");
    check("E2: restricted mark-all-read не трогает feedback_received (вне scope)", nFeedbackMid.status !== "read");
    check("E3: restricted mark-all-read не трогает repeat_visit_reminder (вне scope)", nRepeatVisitMid.status !== "read");

    // F — owner всё ещё может пометить их прочитанными по отдельности (не повреждены)
    const ownerPageForMarkRead = await owner.get("/notifications");
    const rescheduleFrag = notificationFragment(ownerPageForMarkRead.html, nReschedule.id);
    check("F0: форма mark-read для reschedule_offer найдена у owner", rescheduleFrag.includes(`value="${nReschedule.id}"`));
    await owner.postForm("/notifications", rescheduleFrag, { id: nReschedule.id });
    const nRescheduleFinal = await prisma.notification.findUniqueOrThrow({ where: { id: nReschedule.id } });
    check("F1: owner может пометить reschedule_offer прочитанным", nRescheduleFinal.status === "read");
  } finally {
    await prisma.notification.deleteMany({ where: { body: { startsWith: "e2e-notif" } } });
    await prisma.user.deleteMany({ where: { email: "e2e-notif-restricted@e2e.local" } });
    await prisma.clinic.delete({ where: { id: clinicB.id } });
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
