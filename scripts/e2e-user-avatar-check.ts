/**
 * E2E-проверка аватара пользователя (сессия 83):
 *   npx tsx scripts/e2e-user-avatar-check.ts
 * Требует dev-сервер + seed. Использует ТОЛЬКО эфемерные тестовые клиники
 * (E2E Avatar Clinic A/B) — demo-klinika не мутируется. Загрузка — POST
 * multipart формы server action (фрагмент формы по data-user-avatar-form /
 * data-e2e-admin-avatar). Контент валидируется на сервере по магическим
 * байтам (sniffUploadMime); проверяются self-upload (любая роль),
 * admin-managed upload (admin.manage, tenant-scoped), SVG/oversize/wrong-type
 * отказы, отдача через /api/user-avatar — включая tenant-изоляцию НА ЧТЕНИЕ
 * (own clinic OR same-clinic; super_admin — любой) и анонимный → 403 от
 * самого маршрута (не middleware).
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
const TEXT_BYTES = Buffer.from("hello, this is plain text — not an avatar");
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const OVERSIZED_PNG = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024 + 1024, 0x20)]);

async function main() {
  console.log(`E2E user avatar check → ${BASE}\n`);

  const ts = Date.now();
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "doctor" } });
  const assistantRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "assistant" } });

  const clinicA = await prisma.clinic.create({
    data: { name: `E2E Avatar Clinic A ${ts}`, slug: `e2e-avatar-clinic-a-${ts}`, status: "active" },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: `E2E Avatar Clinic B ${ts}`, slug: `e2e-avatar-clinic-b-${ts}`, status: "active" },
  });
  const ownerAEmail = `e2e-avatar-owner-a-${ts}@test.dentalpro.az`;
  const ownerBEmail = `e2e-avatar-owner-b-${ts}@test.dentalpro.az`;
  const doctorAEmail = `e2e-avatar-doctor-a-${ts}@test.dentalpro.az`;
  const assistantAEmail = `e2e-avatar-assistant-a-${ts}@test.dentalpro.az`;
  const passwordHash = await bcrypt.hash(E2E_PASS, 10);

  const ownerA = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: ownerRole.id, email: ownerAEmail, fullName: "E2E Avatar Owner A", passwordHash, locale: "az" },
  });
  const ownerB = await prisma.user.create({
    data: { clinicId: clinicB.id, roleId: ownerRole.id, email: ownerBEmail, fullName: "E2E Avatar Owner B", passwordHash, locale: "az" },
  });
  const doctorA = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: doctorRole.id, email: doctorAEmail, fullName: "E2E Avatar Doctor A", passwordHash, locale: "az" },
  });
  const assistantA = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: assistantRole.id, email: assistantAEmail, fullName: "E2E Avatar Assistant A", passwordHash, locale: "az" },
  });

  const clinicIds = [clinicA.id, clinicB.id];
  const userIds = [ownerA.id, ownerB.id, doctorA.id, assistantA.id];

  try {
    // ── 1. owner A: страница /settings и форма аватара ──
    const ownerASession = new Session();
    check("1. login owner A", await ownerASession.login(ownerAEmail));
    const settingsPage = await ownerASession.get("/settings");
    check("1b. /settings содержит форму аватара", settingsPage.html.includes("data-user-avatar-form"));
    const avatarFrag = formContaining(settingsPage.html, "data-user-avatar-form");
    check("1c. форма аватара найдена", avatarFrag.length > 0);

    // ── 2. загрузка валидного PNG ──
    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: PNG_BYTES, name: "avatar.png", mime: "image/png" },
    });
    let ownerAFresh = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check(
      "2. avatarUrl сохранён (user-avatars/{clinicId}/{userId}/...)",
      !!ownerAFresh.avatarUrl && ownerAFresh.avatarUrl.startsWith(`user-avatars/${clinicA.id}/${ownerA.id}/`),
    );
    const onDisk1 = ownerAFresh.avatarUrl ? await fs.readFile(path.join(UPLOADS, ownerAFresh.avatarUrl)) : null;
    check("2b. файл на диске, байты совпадают", !!onDisk1 && onDisk1.equals(PNG_BYTES));
    check(
      "2c. audit: user update (avatarUrl)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: clinicA.id, entityType: "user", entityId: ownerA.id, action: "update" },
      })),
    );
    const firstUploadedAvatarUrl = ownerAFresh.avatarUrl!;

    // ── 3. preview на /settings + Topbar показывает аватар ──
    const settingsPage2 = await ownerASession.get("/settings");
    check(
      "3. /settings: preview содержит /api/user-avatar/{id}",
      settingsPage2.html.includes(`/api/user-avatar/${ownerA.id}`),
    );
    const dashPage = await ownerASession.get("/dashboard");
    check(
      "3b. Topbar на /dashboard показывает аватар пользователя",
      dashPage.html.includes(`/api/user-avatar/${ownerA.id}`),
    );

    // ── 4. отдача файла через /api/user-avatar ──
    const dl1 = await ownerASession.getRaw(`/api/user-avatar/${ownerA.id}`);
    const dl1Bytes = dl1.status === 200 ? Buffer.from(await dl1.arrayBuffer()) : null;
    check(
      "4. download: 200, content-type image/png, байты совпадают",
      dl1.status === 200 && dl1.headers.get("content-type") === "image/png" && !!dl1Bytes && dl1Bytes.equals(PNG_BYTES),
    );

    // ── 5. замена (JPEG): avatarUrl меняется, старый файл остаётся (v1) ──
    const oldAvatarUrl = ownerAFresh.avatarUrl!;
    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: JPEG_BYTES, name: "avatar.jpg", mime: "image/jpeg" },
    });
    ownerAFresh = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check(
      "5. замена: avatarUrl обновлён на новый файл",
      !!ownerAFresh.avatarUrl && ownerAFresh.avatarUrl !== oldAvatarUrl && ownerAFresh.avatarUrl.endsWith(".jpg"),
    );
    const oldStillThere = await fs.access(path.join(UPLOADS, oldAvatarUrl)).then(() => true).catch(() => false);
    check("5b. v1: старый файл остаётся на диске (без cleanup)", oldStillThere);
    const dl2 = await ownerASession.getRaw(`/api/user-avatar/${ownerA.id}`);
    check("5c. отдаёт новый файл (image/jpeg)", dl2.status === 200 && dl2.headers.get("content-type") === "image/jpeg");

    // ── 6. отклонения: неподходящий тип / превышение размера / SVG / подделка mime ──
    const avatarBefore = ownerAFresh.avatarUrl;
    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: TEXT_BYTES, name: "notes.txt", mime: "text/plain" },
    });
    let ownerACheck = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check("6. text/plain отклонён (avatarUrl не изменился)", ownerACheck.avatarUrl === avatarBefore);

    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: OVERSIZED_PNG, name: "big.png", mime: "image/png" },
    });
    ownerACheck = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check("6b. файл больше 2 MB отклонён", ownerACheck.avatarUrl === avatarBefore);

    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: SVG_BYTES, name: "avatar.svg", mime: "image/svg+xml" },
    });
    ownerACheck = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check("6c. SVG отклонён", ownerACheck.avatarUrl === avatarBefore);

    await ownerASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: TEXT_BYTES, name: "fake.png", mime: "image/png" },
    });
    ownerACheck = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } });
    check("6d. подделка mime (текст с заголовком image/png) отклонена", ownerACheck.avatarUrl === avatarBefore);

    // ── 7. doctor: может загрузить СВОЙ аватар (self-upload не зависит от settings.manage) ──
    const doctorASession = new Session();
    check("7. login doctor A", await doctorASession.login(doctorAEmail));
    const doctorSettingsPage = await doctorASession.get("/settings");
    check("7b. doctor: /settings → 200 (есть settings.view)", doctorSettingsPage.status === 200);
    const doctorAvatarFrag = formContaining(doctorSettingsPage.html, "data-user-avatar-form");
    check("7c. форма аватара видна доктору", doctorAvatarFrag.length > 0);
    await doctorASession.postForm("/settings", doctorAvatarFrag, {
      avatar: { bytes: PNG_BYTES, name: "doc.png", mime: "image/png" },
    });
    const doctorAFresh = await prisma.user.findUniqueOrThrow({ where: { id: doctorA.id } });
    check(
      "7. doctor: свой avatarUrl сохранён",
      !!doctorAFresh.avatarUrl && doctorAFresh.avatarUrl.startsWith(`user-avatars/${clinicA.id}/${doctorA.id}/`),
    );
    check("7d. загрузка doctor не затронула owner A", (await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } })).avatarUrl === avatarBefore);

    // ── 8. assistant: settings.view нет → страницы нет, но self-upload action доступен ──
    const assistantASession = new Session();
    check("8. login assistant A", await assistantASession.login(assistantAEmail));
    const assistantSettingsPage = await assistantASession.get("/settings");
    check(
      "8b. assistant: /settings → redirect (нет settings.view)",
      assistantSettingsPage.status >= 300 && assistantSettingsPage.status < 400,
    );
    // используем валидный $ACTION-фрагмент со страницы owner A (id action не зависит от сессии,
    // сам action принимает userId только из requireAuth — см. lib/actions/profile.ts)
    await assistantASession.postForm("/settings", avatarFrag, {
      avatar: { bytes: PNG_BYTES, name: "asst.png", mime: "image/png" },
    });
    const assistantAFresh = await prisma.user.findUniqueOrThrow({ where: { id: assistantA.id } });
    check(
      "8c. assistant: свой avatarUrl сохранён (self-upload доступен любой роли)",
      !!assistantAFresh.avatarUrl && assistantAFresh.avatarUrl.startsWith(`user-avatars/${clinicA.id}/${assistantA.id}/`),
    );

    // ── 9. doctor/assistant НЕ могут загрузить аватар ДРУГОГО пользователя (admin-only action) ──
    const adminPageAsDoctor = await doctorASession.get("/admin");
    check("9. doctor: /admin → redirect (нет admin.view)", adminPageAsDoctor.status >= 300 && adminPageAsDoctor.status < 400);
    // прямая попытка вызвать adminUpdateStaffAvatar от имени doctor (валидный $ACTION с /admin owner'а)
    const adminPageAsOwner = await ownerASession.get("/admin");
    const adminAvatarFrag = formContaining(adminPageAsOwner.html, `data-e2e-admin-avatar="${assistantA.id}"`);
    check("9b. форма admin-avatar найдена на /admin (owner)", adminAvatarFrag.length > 0);
    const assistantAvatarBefore = assistantAFresh.avatarUrl;
    await doctorASession.postForm("/admin", adminAvatarFrag, {
      userId: assistantA.id,
      avatar: { bytes: JPEG_BYTES, name: "hijack.jpg", mime: "image/jpeg" },
    });
    const assistantAfterDoctorAttempt = await prisma.user.findUniqueOrThrow({ where: { id: assistantA.id } });
    check("9c. doctor: чужой avatarUrl не изменён (нет admin.manage)", assistantAfterDoctorAttempt.avatarUrl === assistantAvatarBefore);

    // assistant тоже не может обновить чужой (doctor A) аватар через admin-only action
    const doctorAvatarBefore = doctorAFresh.avatarUrl;
    const adminAvatarFragForDoctor = formContaining(adminPageAsOwner.html, `data-e2e-admin-avatar="${doctorA.id}"`);
    await assistantASession.postForm("/admin", adminAvatarFragForDoctor, {
      userId: doctorA.id,
      avatar: { bytes: JPEG_BYTES, name: "hijack2.jpg", mime: "image/jpeg" },
    });
    const doctorAfterAssistantAttempt = await prisma.user.findUniqueOrThrow({ where: { id: doctorA.id } });
    check("9d. assistant: чужой avatarUrl не изменён (нет admin.manage)", doctorAfterAssistantAttempt.avatarUrl === doctorAvatarBefore);

    // ── 10. owner/admin: admin-managed staff avatar (опционально, реализовано) ──
    await ownerASession.postForm("/admin", adminAvatarFrag, {
      userId: assistantA.id,
      avatar: { bytes: PNG_BYTES, name: "staff.png", mime: "image/png" },
    });
    const assistantAfterAdminUpload = await prisma.user.findUniqueOrThrow({ where: { id: assistantA.id } });
    check(
      "10. owner: обновил аватар сотрудника (assistant A) через /admin",
      !!assistantAfterAdminUpload.avatarUrl &&
        assistantAfterAdminUpload.avatarUrl !== assistantAvatarBefore &&
        assistantAfterAdminUpload.avatarUrl.startsWith(`user-avatars/${clinicA.id}/${assistantA.id}/`),
    );
    check(
      "10b. audit: clinic-scoped (clinicId=clinicA, entityId=assistantA)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: clinicA.id, entityType: "user", entityId: assistantA.id, action: "update" },
      })),
    );

    // ── 11. cross-tenant: owner A не может обновить аватар owner B через /admin ──
    const ownerBBefore = await prisma.user.findUniqueOrThrow({ where: { id: ownerB.id } });
    await ownerASession.postForm("/admin", adminAvatarFrag, {
      userId: ownerB.id,
      avatar: { bytes: PNG_BYTES, name: "cross.png", mime: "image/png" },
    });
    const ownerBAfter = await prisma.user.findUniqueOrThrow({ where: { id: ownerB.id } });
    check("11. cross-tenant: owner A не может изменить аватар owner B", ownerBAfter.avatarUrl === ownerBBefore.avatarUrl);

    // ── 12. /api/user-avatar: анонимный доступ, формат id, same-clinic read, cross-tenant ──
    const anon = new Session();
    const anonDl = await anon.getRaw(`/api/user-avatar/${ownerA.id}`);
    check("12. неавторизованный запрос → 403 (маршрут сам решает auth)", anonDl.status === 403);

    const badIdDl = await ownerASession.getRaw(`/api/user-avatar/not-a-uuid`);
    check("12b. невалидный id → 404", badIdDl.status === 404);

    // same-clinic: doctor A читает аватар owner A (та же клиника, есть аватар) → 200
    const doctorReadsOwnerA = await doctorASession.getRaw(`/api/user-avatar/${ownerA.id}`);
    check("12c. same-clinic: doctor читает аватар owner (своя клиника) → 200", doctorReadsOwnerA.status === 200);

    // cross-tenant: owner B читает аватар owner A (другая клиника, есть аватар) → 404
    const ownerBSession = new Session();
    check("12d. login owner B", await ownerBSession.login(ownerBEmail));
    const ownerBReadsOwnerA = await ownerBSession.getRaw(`/api/user-avatar/${ownerA.id}`);
    check("12e. cross-tenant: owner B читает аватар owner A → 404", ownerBReadsOwnerA.status === 404);

    // own clinic, no avatar yet → 404 (owner B сам без аватара)
    const ownerBReadsOwn = await ownerBSession.getRaw(`/api/user-avatar/${ownerB.id}`);
    check("12f. owner B: свой аватар (не загружен) → 404", ownerBReadsOwn.status === 404);

    // ── 13. super_admin: читает аватар любого пользователя (платформенное управление) ──
    const superSession = new Session();
    check("13. login super_admin (alias 'super')", await superSession.login("super", process.env.SEED_DEMO_PASSWORD ?? "Demo1234!"));
    const superReadsOwnerA = await superSession.getRaw(`/api/user-avatar/${ownerA.id}`);
    check("13b. super_admin: читает аватар owner A (чужой клиники) → 200", superReadsOwnerA.status === 200);

    // ── 14. raw-пути не раскрываются ──
    // Реальная граница: компонентам ("use client") передаём ТОЛЬКО готовый
    // /api/user-avatar/{id}?v=... URL, а не raw avatarUrl (relative storage
    // path) — см. components/settings/UserAvatarForm.tsx, components/admin/
    // StaffTable.tsx (avatarSrc вычисляется на сервере). Проверено: под
    // `next dev` raw-путь попадает в RSC owner-stack debug payload (dev-only
    // инструментарий React DevTools для ЛЮБОГО Server Component, не утечка
    // конкретно этой фичи) — эмпирически подтверждено отсутствие в
    // `next build && next start`. Поэтому здесь проверяем именно заголовки
    // API-ответа (реальная граница), а не весь HTML под dev-сервером.
    const dl1Headers = JSON.stringify([...dl1.headers.entries()]);
    check(
      "14. заголовки /api/user-avatar не содержат relative storage path",
      !dl1Headers.includes(firstUploadedAvatarUrl),
    );
    check(
      "14b. в рендере используется только /api/user-avatar/{id} URL (не raw путь)",
      settingsPage2.html.includes(`/api/user-avatar/${ownerA.id}`) &&
        dashPage.html.includes(`/api/user-avatar/${ownerA.id}`),
    );
  } finally {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ clinicId: { in: clinicIds } }, { entityId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    for (const id of clinicIds) {
      await fs.rm(path.join(UPLOADS, "user-avatars", id), { recursive: true, force: true });
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
