/**
 * E2E-проверка Live Dashboard (dev-скрипт):
 *   npx tsx scripts/e2e-dashboard-check.ts
 * Требует dev-сервер + seed. Сверяет цифры карточек с реальными
 * значениями из БД (в scope роли) и отсутствие demo-заглушек.
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

/** Значение StatCard по заголовку: <p>title</p> … <p class="…tabular-nums…">value</p>. */
function cardValue(html: string, title: string): string | null {
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`${esc}</p>[\\s\\S]{0,400}?tabular-nums[^>]*>([^<]+)</p>`));
  return m ? m[1].trim() : null;
}

function todayBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

const NON_BLOCKING = ["cancelled", "late_cancelled", "no_show"] as const;

async function main() {
  console.log(`E2E dashboard check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const { from, to } = todayBounds();

  // чужая клиника с данными «на сегодня» — проверка изоляции тенанта
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-dash-clinic-b" },
    update: {},
    create: { name: "E2E Dash B", slug: "e2e-dash-clinic-b", status: "active" },
  });
  const roleB = await prisma.role.findFirstOrThrow({ where: { key: "doctor", clinicId: null } });
  const userB = await prisma.user.upsert({
    where: { email: "e2e-dash-b@e2e.local" },
    update: { clinicId: clinicB.id },
    create: {
      email: "e2e-dash-b@e2e.local",
      fullName: "E2E B Doctor",
      clinicId: clinicB.id,
      roleId: roleB.id,
      passwordHash: "x",
    },
  });
  const doctorB = await prisma.doctor.upsert({
    where: { userId: userB.id },
    update: {},
    create: { clinicId: clinicB.id, userId: userB.id },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EDash", phone: "+994000000001" },
  });
  const apptStart = new Date(from.getTime() + 9 * 3600_000);
  const apptB = await prisma.appointment.create({
    data: {
      clinicId: clinicB.id,
      patientId: patientB.id,
      doctorId: doctorB.id,
      startsAt: apptStart,
      endsAt: new Date(apptStart.getTime() + 30 * 60_000),
      status: "scheduled",
      createdById: userB.id,
    },
  });

  try {
    // ── owner: цифры = клиника A целиком ────────────────────────────
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));
    const dash = await owner.get("/dashboard");
    check("dashboard открывается", dash.status === 200 && dash.html.includes("Bugünkü qəbullar"));

    // 2. demo-заглушки удалены
    check("demo-бейдж и demo-цифры удалены",
      !dash.html.includes(">DEMO<") &&
        !dash.html.includes("Demo məlumatlar") &&
        !dash.html.includes("1 240 ₼") &&
        !dash.html.includes("Aktiv pasiyentlər"));

    // 3. today appointments — реальный count (clinic A, активные статусы)
    const todayA = await prisma.appointment.count({
      where: {
        clinicId: clinic.id,
        deletedAt: null,
        startsAt: { gte: from, lt: to },
        status: { notIn: [...NON_BLOCKING] },
      },
    });
    check("today appointments = реальное значение",
      cardValue(dash.html, "Bugünkü qəbullar") === String(todayA),
      `card=${cardValue(dash.html, "Bugünkü qəbullar")}, db=${todayA}`);

    // 8. чужой tenant не учитывается (в БД у клиники B сегодня есть приём)
    const todayB = await prisma.appointment.count({
      where: { clinicId: clinicB.id, deletedAt: null, startsAt: { gte: from, lt: to } },
    });
    check("чужая клиника имеет сегодняшний приём (контроль теста)", todayB >= 1);
    check("чужой tenant не попадает в count",
      cardValue(dash.html, "Bugünkü qəbullar") !== String(todayA + todayB) || todayB === 0);
    check("чужой пациент не виден на dashboard", !dash.html.includes("E2EDash"));

    // 4. finance debt — реальная сумма открытых долгов
    const debtAgg = await prisma.debt.aggregate({
      where: { clinicId: clinic.id, status: { in: ["open", "partial"] } },
      _sum: { amount: true },
    });
    const debtStr = ((debtAgg._sum.amount ?? 0) / 100).toLocaleString("az-AZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    check("pending payments = реальный долг",
      cardValue(dash.html, "Ödəniş gözləyənlər")?.startsWith(debtStr) ?? false,
      `card=${cardValue(dash.html, "Ödəniş gözləyənlər")}, db=${debtStr}`);

    // 5. low stock — реальный count (quantity ≤ minQuantity)
    const items = await prisma.inventoryItem.findMany({
      where: { clinicId: clinic.id, deletedAt: null, isActive: true },
      select: { quantity: true, minQuantity: true },
    });
    const lowA = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity)).length;
    check("low stock = реальное значение",
      cardValue(dash.html, "Az qalan materiallar") === String(lowA),
      `card=${cardValue(dash.html, "Az qalan materiallar")}, db=${lowA}`);

    // панели: today appointments + открытые счета + low stock + activity
    check("панель сегодняшних приёмов с пациентом",
      dash.html.includes("Həsənov") || todayA === 0);
    check("панель открытых счетов (INV-)", dash.html.includes("INV-0000"));
    check("панель активности (audit) у owner", dash.html.includes("Son əməliyyatlar"));

    // ── doctor: scope только свои данные ─────────────────────────────
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    const doctorA = await prisma.doctor.findFirstOrThrow({
      where: { clinicId: clinic.id, user: { email: "hekim@demo.dentalpro.az" } },
    });
    const dashDoc = await hekim.get("/dashboard");
    const todayDoc = await prisma.appointment.count({
      where: {
        clinicId: clinic.id,
        doctorId: doctorA.id,
        deletedAt: null,
        startsAt: { gte: from, lt: to },
        status: { notIn: [...NON_BLOCKING] },
      },
    });
    check("doctor: today appointments в своём scope",
      cardValue(dashDoc.html, "Bugünkü qəbullar") === String(todayDoc),
      `card=${cardValue(dashDoc.html, "Bugünkü qəbullar")}, db=${todayDoc}`);
    check("doctor: панели активности (audit) нет", !dashDoc.html.includes("Son əməliyyatlar"));

    // ── assistant: без finance/inventory.view карточек нет ───────────
    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    const dashAsst = await asst.get("/dashboard");
    check("assistant: dashboard открывается", dashAsst.status === 200);
    check("assistant: finance-карточки нет", !dashAsst.html.includes("Ödəniş gözləyənlər"));
    check("assistant: inventory-карточки нет", !dashAsst.html.includes("Az qalan materiallar"));
    check("assistant: appointments-карточка есть (scope врача)",
      dashAsst.html.includes("Bugünkü qəbullar"));
  } finally {
    // cleanup чужой клиники
    await prisma.appointment.delete({ where: { id: apptB.id } });
    await prisma.patient.delete({ where: { id: patientB.id } });
    await prisma.doctor.delete({ where: { id: doctorB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
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
