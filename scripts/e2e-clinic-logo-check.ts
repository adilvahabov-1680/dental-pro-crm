/**
 * E2E-проверка лого клиники (сессия 81):
 *   npx tsx scripts/e2e-clinic-logo-check.ts
 * Требует dev-сервер + seed. Использует ТОЛЬКО эфемерные тестовые клиники
 * (E2E Logo Clinic A/B) — demo-klinika не мутируется (logoUrl демо-клиники
 * не трогаем). Загрузка — POST multipart формы server action
 * (фрагмент формы по data-clinic-logo-form / data-e2e-platform-logo).
 * Контент валидируется на сервере по магическим байтам (sniffUploadMime);
 * проверяются tenant/scope/permissions, SVG/oversize/wrong-type отказы,
 * платформенный (super_admin) upload-flow и отдача через /api/clinic-logo —
 * включая tenant-изоляцию НА ЧТЕНИЕ (own-clinic only; super_admin — любая)
 * и то, что анонимный запрос получает 403 от самого маршрута, а не редирект
 * от middleware (см. middleware.ts).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const E2E_PASS = "E2eTest9999!";
const UPLOADS = path.join(process.cwd(), "uploads");
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
  async get(p: string) {
    const res = await fetch(BASE + p, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  async getRaw(p: string) {
    const res = await fetch(BASE + p, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return res;
  }
  /** POST формы server action; поля-файлы передаются как { bytes, name, mime }. */
  async postForm(
    p: string,
    pageHtml: string,
    fields: Record<string, string | { bytes: Buffer; name: string; mime: string }>,
  ) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "string") fd.set(k, v);
      else fd.set(k, new Blob([new Uint8Array(v.bytes)], { type: v.mime }), v.name);
    }
    const res = await fetch(BASE + p, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), origin: BASE },
      body: fd,
    });
    this.store(res);
    return { status: res.status, location: res.headers.get("location") ?? undefined };
  }
  async login(email: string, password = E2E_PASS) {
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

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]),
]);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20, 0),
]);
const TEXT_BYTES = Buffer.from("hello, this is plain text — not a logo");
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const OVERSIZED_PNG = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024 + 1024, 0x20)]);

async function main() {
  console.log(`E2E clinic logo check → ${BASE}\n`);

  const ts = Date.now();
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "doctor" } });
  const assistantRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "assistant" } });

  const clinicA = await prisma.clinic.create({
    data: { name: `E2E Logo Clinic A ${ts}`, slug: `e2e-logo-clinic-a-${ts}`, status: "active" },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: `E2E Logo Clinic B ${ts}`, slug: `e2e-logo-clinic-b-${ts}`, status: "active" },
  });
  const ownerAEmail = `e2e-logo-owner-a-${ts}@test.dentalpro.az`;
  const ownerBEmail = `e2e-logo-owner-b-${ts}@test.dentalpro.az`;
  const doctorAEmail = `e2e-logo-doctor-a-${ts}@test.dentalpro.az`;
  const assistantAEmail = `e2e-logo-assistant-a-${ts}@test.dentalpro.az`;
  const passwordHash = await bcrypt.hash(E2E_PASS, 10);

  const ownerA = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: ownerRole.id, email: ownerAEmail, fullName: "E2E Logo Owner A", passwordHash, locale: "az" },
  });
  const ownerB = await prisma.user.create({
    data: { clinicId: clinicB.id, roleId: ownerRole.id, email: ownerBEmail, fullName: "E2E Logo Owner B", passwordHash, locale: "az" },
  });
  await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: doctorRole.id, email: doctorAEmail, fullName: "E2E Logo Doctor A", passwordHash, locale: "az" },
  });
  await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: assistantRole.id, email: assistantAEmail, fullName: "E2E Logo Assistant A", passwordHash, locale: "az" },
  });

  const clinicIds = [clinicA.id, clinicB.id];

  try {
    // ── 1. owner A: страница /settings и форма лого ──
    const ownerASession = new Session();
    check("1. login owner A", await ownerASession.login(ownerAEmail));
    const settingsPage = await ownerASession.get("/settings");
    check("1b. /settings содержит форму лого", settingsPage.html.includes("data-clinic-logo-form"));
    const logoFrag = formContaining(settingsPage.html, "data-clinic-logo-form");
    check("1c. форма лого найдена", logoFrag.length > 0);

    // ── 2. загрузка валидного PNG ──
    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: PNG_BYTES, name: "logo.png", mime: "image/png" },
    });
    let clinicAFresh = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check(
      "2. logoUrl сохранён (clinic-logos/{clinicId}/...)",
      !!clinicAFresh.logoUrl && clinicAFresh.logoUrl.startsWith(`clinic-logos/${clinicA.id}/`),
    );
    const onDisk1 = clinicAFresh.logoUrl
      ? await fs.readFile(path.join(UPLOADS, clinicAFresh.logoUrl))
      : null;
    check("2b. файл на диске, байты совпадают", !!onDisk1 && onDisk1.equals(PNG_BYTES));
    check(
      "2c. audit: clinic update (logoUrl)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: clinicA.id, entityType: "clinic", entityId: clinicA.id, action: "update" },
      })),
    );

    // ── 3. preview на /settings + Topbar показывает лого ──
    const settingsPage2 = await ownerASession.get("/settings");
    check(
      "3. /settings: preview содержит /api/clinic-logo/{id}",
      settingsPage2.html.includes(`/api/clinic-logo/${clinicA.id}`),
    );
    const dashPage = await ownerASession.get("/dashboard");
    check(
      "3b. Topbar на /dashboard показывает лого клиники",
      dashPage.html.includes(`/api/clinic-logo/${clinicA.id}`) && dashPage.html.includes(clinicA.name),
    );

    // ── 4. отдача файла через /api/clinic-logo ──
    const dl1 = await ownerASession.getRaw(`/api/clinic-logo/${clinicA.id}`);
    const dl1Bytes = dl1.status === 200 ? Buffer.from(await dl1.arrayBuffer()) : null;
    check(
      "4. download: 200, content-type image/png, байты совпадают",
      dl1.status === 200 && dl1.headers.get("content-type") === "image/png" && !!dl1Bytes && dl1Bytes.equals(PNG_BYTES),
    );

    // ── 5. замена лого (JPEG): logoUrl меняется, старый файл остаётся (v1) ──
    const oldLogoUrl = clinicAFresh.logoUrl!;
    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: JPEG_BYTES, name: "logo.jpg", mime: "image/jpeg" },
    });
    clinicAFresh = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check(
      "5. замена: logoUrl обновлён на новый файл",
      !!clinicAFresh.logoUrl && clinicAFresh.logoUrl !== oldLogoUrl && clinicAFresh.logoUrl.endsWith(".jpg"),
    );
    const oldStillThere = await fs.access(path.join(UPLOADS, oldLogoUrl)).then(() => true).catch(() => false);
    check("5b. v1: старый файл остаётся на диске (без cleanup)", oldStillThere);
    const dl2 = await ownerASession.getRaw(`/api/clinic-logo/${clinicA.id}`);
    check("5c. отдаёт новый файл (image/jpeg)", dl2.status === 200 && dl2.headers.get("content-type") === "image/jpeg");

    // ── 6. прочие поля клиники не изменились ──
    check(
      "6. замена лого не меняет другие поля клиники",
      clinicAFresh.name === clinicA.name && clinicAFresh.phone === clinicA.phone && clinicAFresh.email === clinicA.email,
    );

    // ── 7. отклонения: неподходящий тип / превышение размера / SVG ──
    const logoBefore = clinicAFresh.logoUrl;
    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: TEXT_BYTES, name: "notes.txt", mime: "text/plain" },
    });
    let clinicCheck = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("7. text/plain отклонён (logoUrl не изменился)", clinicCheck.logoUrl === logoBefore);

    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: OVERSIZED_PNG, name: "big.png", mime: "image/png" },
    });
    clinicCheck = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("7b. файл больше 2 MB отклонён", clinicCheck.logoUrl === logoBefore);

    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: SVG_BYTES, name: "logo.svg", mime: "image/svg+xml" },
    });
    clinicCheck = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("7c. SVG отклонён", clinicCheck.logoUrl === logoBefore);

    // подделка mime: PNG-расширение/заголовок клиента, но текстовое содержимое
    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: TEXT_BYTES, name: "fake.png", mime: "image/png" },
    });
    clinicCheck = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("7d. подделка mime (текст с заголовком image/png) отклонена", clinicCheck.logoUrl === logoBefore);

    // ── 8. permissions: doctor / assistant не могут загрузить лого клиники ──
    const doctorASession = new Session();
    check("8. login doctor A", await doctorASession.login(doctorAEmail));
    const settingsAsDoctorPage = await doctorASession.get("/settings");
    check(
      "8b. doctor: /settings — read-only (нет формы лого)",
      settingsAsDoctorPage.status === 200 && !settingsAsDoctorPage.html.includes("data-clinic-logo-form"),
    );
    // прямой POST действия (валидный $ACTION-фрагмент со страницы owner A) от имени doctor —
    // requirePermission("settings.manage") должен отклонить запрос до записи в БД
    const doctorUploadRes = await doctorASession.postForm("/settings", logoFrag, {
      logo: { bytes: PNG_BYTES, name: "logo.png", mime: "image/png" },
    });
    check(
      "8c. doctor: прямой upload отклонён (нет settings.manage) → redirect",
      doctorUploadRes.status >= 300 && doctorUploadRes.status < 400,
    );

    const assistantASession = new Session();
    check("9. login assistant A", await assistantASession.login(assistantAEmail));
    const settingsAsAssistantPage = await assistantASession.get("/settings");
    check(
      "9b. assistant: /settings → redirect (нет settings.view)",
      settingsAsAssistantPage.status >= 300 && settingsAsAssistantPage.status < 400,
    );
    const assistantUploadRes = await assistantASession.postForm("/settings", logoFrag, {
      logo: { bytes: PNG_BYTES, name: "logo.png", mime: "image/png" },
    });
    check(
      "9c. assistant: прямой upload отклонён → redirect",
      assistantUploadRes.status >= 300 && assistantUploadRes.status < 400,
    );

    clinicCheck = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("9d. logoUrl не изменился после попыток doctor/assistant", clinicCheck.logoUrl === logoBefore);

    // ── 10. cross-clinic: владелец A не может перезаписать лого клиники B ──
    const ownerBSession = new Session();
    check("10. login owner B", await ownerBSession.login(ownerBEmail));
    const clinicBBefore = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicB.id } });
    check("10b. clinic B изначально без лого", clinicBBefore.logoUrl === null);

    // owner A пытается подделать clinicId в форме — серверный action игнорирует client-supplied clinicId
    await ownerASession.postForm("/settings", logoFrag, {
      logo: { bytes: PNG_BYTES, name: "logo.png", mime: "image/png" },
      clinicId: clinicB.id,
    });
    const clinicBAfter = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicB.id } });
    check("10c. clinic B не затронута подделкой clinicId в форме owner A", clinicBAfter.logoUrl === null);
    const clinicAAfterTamper = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicA.id } });
    check("10d. clinic A (сессия owner A) получила обновление лого", clinicAAfterTamper.logoUrl !== logoBefore);

    // ── 11. /api/clinic-logo: анонимный доступ, формат id, чтение — own-clinic only ──
    const anon = new Session();
    const anonDl = await anon.getRaw(`/api/clinic-logo/${clinicA.id}`);
    check("11. неавторизованный запрос → 403 (маршрут сам решает auth, не middleware)", anonDl.status === 403);

    const badIdDl = await ownerASession.getRaw(`/api/clinic-logo/not-a-uuid`);
    check("11b. невалидный id → 404", badIdDl.status === 404);

    // ownerBSession уже авторизована (шаг 10)
    const ownB_readsOwnNoLogo = await ownerBSession.getRaw(`/api/clinic-logo/${clinicB.id}`);
    check("11d. owner B: своя клиника без лого → 404", ownB_readsOwnNoLogo.status === 404);

    // tenant-изоляция НА ЧТЕНИЕ: clinicA точно имеет лого (шаги 2-7) — 404 здесь
    // доказывает блокировку по tenant, а не случайное отсутствие файла
    const ownB_readsA = await ownerBSession.getRaw(`/api/clinic-logo/${clinicA.id}`);
    check("11e. owner B: чужое лого (clinic A, есть лого) → 404 (cross-tenant)", ownB_readsA.status === 404);

    const ownA_readsB = await ownerASession.getRaw(`/api/clinic-logo/${clinicB.id}`);
    check("11f. owner A: чужое лого (clinic B) → 404 (cross-tenant)", ownA_readsB.status === 404);

    const ownA_readsOwn = await ownerASession.getRaw(`/api/clinic-logo/${clinicA.id}`);
    check("11g. owner A: своя клиника (есть лого) → 200", ownA_readsOwn.status === 200);

    // ── 12. super_admin: чтение лого любой клиники (платформенное управление) ──
    const superSession = new Session();
    check("12. login super_admin (alias 'super')", await superSession.login("super", process.env.SEED_DEMO_PASSWORD ?? "Demo1234!"));
    const superReadsA = await superSession.getRaw(`/api/clinic-logo/${clinicA.id}`);
    check("12b. super_admin: читает лого clinic A (чужой клиники) → 200", superReadsA.status === 200);
    const superReadsBNoLogo = await superSession.getRaw(`/api/clinic-logo/${clinicB.id}`);
    check("12c. super_admin: clinic B без лого → 404 (не cross-tenant, а отсутствие файла)", superReadsBNoLogo.status === 404);

    // ── 13. платформенный (super_admin) upload для clinic B ──
    const clinicBDetailPage = await superSession.get(`/platform/clinics/${clinicB.id}`);
    check("13b. super_admin: страница клиники B → 200", clinicBDetailPage.status === 200);
    const platformLogoFrag = formContaining(clinicBDetailPage.html, `data-e2e-platform-logo="${clinicB.id}"`);
    check("13c. платформенная форма лого найдена", platformLogoFrag.length > 0);

    await superSession.postForm(`/platform/clinics/${clinicB.id}`, platformLogoFrag, {
      clinicId: clinicB.id,
      logo: { bytes: PNG_BYTES, name: "logo.png", mime: "image/png" },
    });
    const clinicBWithLogo = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicB.id } });
    check(
      "13. платформенная загрузка: logoUrl установлен для clinic B",
      !!clinicBWithLogo.logoUrl && clinicBWithLogo.logoUrl.startsWith(`clinic-logos/${clinicB.id}/`),
    );
    check(
      "13d. audit: платформенное действие (clinicId=null, entityId=clinicB)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: null, entityType: "clinic", entityId: clinicB.id, action: "update" },
      })),
    );
    const superReadsBWithLogo = await superSession.getRaw(`/api/clinic-logo/${clinicB.id}`);
    check("13e. super_admin: clinic B теперь отдаёт лого → 200", superReadsBWithLogo.status === 200);
    const ownA_stillCannotReadB = await ownerASession.getRaw(`/api/clinic-logo/${clinicB.id}`);
    check(
      "13f. owner A: clinic B с лого всё равно недоступна (cross-tenant) → 404",
      ownA_stillCannotReadB.status === 404,
    );

    // ── 14. не-super_admin не может вызвать платформенный upload ──
    const platformLogoBefore = clinicBWithLogo.logoUrl;
    const ownerAPlatformRes = await ownerASession.postForm(`/platform/clinics/${clinicB.id}`, platformLogoFrag, {
      clinicId: clinicB.id,
      logo: { bytes: JPEG_BYTES, name: "x.jpg", mime: "image/jpeg" },
    });
    check(
      "14. owner (не super_admin): платформенный upload → redirect",
      ownerAPlatformRes.status >= 300 && ownerAPlatformRes.status < 400,
    );
    const clinicBUnaffected = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicB.id } });
    check("14b. clinic B логотип не изменился попыткой owner A", clinicBUnaffected.logoUrl === platformLogoBefore);
  } finally {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ clinicId: { in: clinicIds } }, { entityId: { in: clinicIds } }] },
    });
    await prisma.user.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    for (const id of clinicIds) {
      await fs.rm(path.join(UPLOADS, "clinic-logos", id), { recursive: true, force: true });
    }
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
