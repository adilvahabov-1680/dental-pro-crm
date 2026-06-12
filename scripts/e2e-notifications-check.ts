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

async function main() {
  console.log(`E2E notifications check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });

  // сброс артефактов прошлых прогонов
  await prisma.notification.deleteMany({
    where: { body: { startsWith: "e2e-notif" } },
  });

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
  } finally {
    await prisma.notification.deleteMany({ where: { body: { startsWith: "e2e-notif" } } });
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
