/**
 * E2E-проверка подписи врача (сессия 86):
 *   npx tsx scripts/e2e-doctor-signature-check.ts
 * Требует dev-сервер + seed. Использует ТОЛЬКО эфемерные тестовые клиники
 * (E2E Signature Clinic A/B) — demo-klinika не мутируется. Загрузка — POST
 * multipart формы server action (фрагмент формы по data-doctor-signature-form /
 * data-e2e-admin-signature). Контент валидируется на сервере по магическим
 * байтам (sniffUploadMime); проверяются self-upload (только при наличии
 * Doctor-профиля — user.doctorId из сессии), admin-managed upload
 * (admin.manage, tenant-scoped через Doctor.clinicId), SVG/oversize/
 * wrong-type отказы, отдача через /api/doctor-signature — включая БОЛЕЕ
 * УЗКУЮ tenant-изоляцию НА ЧТЕНИЕ, чем у аватара/лого (см. doc-комментарий
 * app/api/doctor-signature/[doctorId]/route.ts: только сам врач, same-clinic
 * admin.view или super_admin — НЕ любой коллега клиники), анонимный → 403
 * от самого маршрута (не middleware), raw-путь не передаётся в client props
 * (см. сессию 84 — реальная граница проверяется через заголовки API-ответа,
 * не через весь page-source под `next dev`, который может содержать
 * RSC owner-stack debug payload независимо от этой фичи).
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
const TEXT_BYTES = Buffer.from("hello, this is plain text — not a signature");
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const OVERSIZED_PNG = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024 + 1024, 0x20)]);

async function main() {
  console.log(`E2E doctor signature check → ${BASE}\n`);

  const ts = Date.now();
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "doctor" } });
  const assistantRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "assistant" } });

  const clinicA = await prisma.clinic.create({
    data: { name: `E2E Signature Clinic A ${ts}`, slug: `e2e-signature-clinic-a-${ts}`, status: "active" },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: `E2E Signature Clinic B ${ts}`, slug: `e2e-signature-clinic-b-${ts}`, status: "active" },
  });
  const passwordHash = await bcrypt.hash(E2E_PASS, 10);

  const ownerAEmail = `e2e-sig-owner-a-${ts}@test.dentalpro.az`;
  const doctorAEmail = `e2e-sig-doctor-a-${ts}@test.dentalpro.az`;
  const doctorA2Email = `e2e-sig-doctor-a2-${ts}@test.dentalpro.az`;
  const assistantAEmail = `e2e-sig-assistant-a-${ts}@test.dentalpro.az`;
  const ownerBEmail = `e2e-sig-owner-b-${ts}@test.dentalpro.az`;
  const doctorBEmail = `e2e-sig-doctor-b-${ts}@test.dentalpro.az`;

  const ownerA = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: ownerRole.id, email: ownerAEmail, fullName: "E2E Sig Owner A", passwordHash, locale: "az" },
  });
  const doctorAUser = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: doctorRole.id, email: doctorAEmail, fullName: "E2E Sig Doctor A", passwordHash, locale: "az" },
  });
  const doctorAProfile = await prisma.doctor.create({ data: { clinicId: clinicA.id, userId: doctorAUser.id } });
  const doctorA2User = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: doctorRole.id, email: doctorA2Email, fullName: "E2E Sig Doctor A2", passwordHash, locale: "az" },
  });
  const doctorA2Profile = await prisma.doctor.create({ data: { clinicId: clinicA.id, userId: doctorA2User.id } });
  const assistantAUser = await prisma.user.create({
    data: { clinicId: clinicA.id, roleId: assistantRole.id, email: assistantAEmail, fullName: "E2E Sig Assistant A", passwordHash, locale: "az" },
  });
  const ownerB = await prisma.user.create({
    data: { clinicId: clinicB.id, roleId: ownerRole.id, email: ownerBEmail, fullName: "E2E Sig Owner B", passwordHash, locale: "az" },
  });
  const doctorBUser = await prisma.user.create({
    data: { clinicId: clinicB.id, roleId: doctorRole.id, email: doctorBEmail, fullName: "E2E Sig Doctor B", passwordHash, locale: "az" },
  });
  const doctorBProfile = await prisma.doctor.create({ data: { clinicId: clinicB.id, userId: doctorBUser.id } });

  const clinicIds = [clinicA.id, clinicB.id];
  const userIds = [ownerA.id, doctorAUser.id, doctorA2User.id, assistantAUser.id, ownerB.id, doctorBUser.id];
  const doctorIds = [doctorAProfile.id, doctorA2Profile.id, doctorBProfile.id];

  try {
    // ── 1. doctor A: видит форму подписи на /settings; owner A — не видит ──
    const doctorASession = new Session();
    check("1. login doctor A", await doctorASession.login(doctorAEmail));
    const doctorSettingsPage = await doctorASession.get("/settings");
    check("1b. doctor: /settings содержит форму подписи", doctorSettingsPage.html.includes("data-doctor-signature-form"));
    const signatureFrag = formContaining(doctorSettingsPage.html, "data-doctor-signature-form");
    check("1c. форма подписи найдена", signatureFrag.length > 0);

    const ownerASession = new Session();
    check("2. login owner A", await ownerASession.login(ownerAEmail));
    const ownerSettingsPage = await ownerASession.get("/settings");
    check(
      "2b. owner (без Doctor-профиля): /settings НЕ содержит форму подписи",
      !ownerSettingsPage.html.includes("data-doctor-signature-form"),
    );

    // ── 3. загрузка валидного PNG ──
    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: PNG_BYTES, name: "sig.png", mime: "image/png" },
    });
    let doctorAFresh = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check(
      "3. signatureUrl сохранён (doctor-signatures/{clinicId}/{doctorId}/...)",
      !!doctorAFresh.signatureUrl && doctorAFresh.signatureUrl.startsWith(`doctor-signatures/${clinicA.id}/${doctorAProfile.id}/`),
    );
    const onDisk1 = doctorAFresh.signatureUrl ? await fs.readFile(path.join(UPLOADS, doctorAFresh.signatureUrl)) : null;
    check("3b. файл на диске, байты совпадают", !!onDisk1 && onDisk1.equals(PNG_BYTES));
    check(
      "3c. audit: doctor update (signatureUrl)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: clinicA.id, entityType: "doctor", entityId: doctorAProfile.id, action: "update" },
      })),
    );
    const firstUploadedSignatureUrl = doctorAFresh.signatureUrl!;

    // ── 4. preview на /settings ──
    const doctorSettingsPage2 = await doctorASession.get("/settings");
    check(
      "4. /settings: preview содержит /api/doctor-signature/{id}",
      doctorSettingsPage2.html.includes(`/api/doctor-signature/${doctorAProfile.id}`),
    );

    // ── 5. отдача файла через /api/doctor-signature ──
    const dl1 = await doctorASession.getRaw(`/api/doctor-signature/${doctorAProfile.id}`);
    const dl1Bytes = dl1.status === 200 ? Buffer.from(await dl1.arrayBuffer()) : null;
    check(
      "5. download: 200, content-type image/png, байты совпадают",
      dl1.status === 200 && dl1.headers.get("content-type") === "image/png" && !!dl1Bytes && dl1Bytes.equals(PNG_BYTES),
    );

    // ── 6. замена (JPEG): signatureUrl меняется, старый файл остаётся (v1) ──
    const oldSignatureUrl = doctorAFresh.signatureUrl!;
    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: JPEG_BYTES, name: "sig.jpg", mime: "image/jpeg" },
    });
    doctorAFresh = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check(
      "6. замена: signatureUrl обновлён на новый файл",
      !!doctorAFresh.signatureUrl && doctorAFresh.signatureUrl !== oldSignatureUrl && doctorAFresh.signatureUrl.endsWith(".jpg"),
    );
    const oldStillThere = await fs.access(path.join(UPLOADS, oldSignatureUrl)).then(() => true).catch(() => false);
    check("6b. v1: старый файл остаётся на диске (без cleanup)", oldStillThere);

    // ── 7. отклонения: неподходящий тип / превышение размера / SVG / подделка mime ──
    const signatureBefore = doctorAFresh.signatureUrl;
    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: TEXT_BYTES, name: "notes.txt", mime: "text/plain" },
    });
    let doctorACheck = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check("7. text/plain отклонён (signatureUrl не изменился)", doctorACheck.signatureUrl === signatureBefore);

    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: OVERSIZED_PNG, name: "big.png", mime: "image/png" },
    });
    doctorACheck = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check("7b. файл больше 2 MB отклонён", doctorACheck.signatureUrl === signatureBefore);

    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: SVG_BYTES, name: "sig.svg", mime: "image/svg+xml" },
    });
    doctorACheck = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check("7c. SVG отклонён", doctorACheck.signatureUrl === signatureBefore);

    await doctorASession.postForm("/settings", signatureFrag, {
      signature: { bytes: TEXT_BYTES, name: "fake.png", mime: "image/png" },
    });
    doctorACheck = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAProfile.id } });
    check("7d. подделка mime (текст с заголовком image/png) отклонена", doctorACheck.signatureUrl === signatureBefore);

    // ── 8. admin-managed: owner A загружает подпись для doctor A2 через /admin ──
    const adminPage = await ownerASession.get("/admin");
    check("8. owner: /admin → 200", adminPage.status === 200);
    const adminSignatureFrag = formContaining(adminPage.html, `data-e2e-admin-signature="${doctorA2Profile.id}"`);
    check("8b. форма admin-signature найдена для doctor A2", adminSignatureFrag.length > 0);

    await ownerASession.postForm("/admin", adminSignatureFrag, {
      doctorId: doctorA2Profile.id,
      signature: { bytes: PNG_BYTES, name: "staff-sig.png", mime: "image/png" },
    });
    const doctorA2AfterAdmin = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorA2Profile.id } });
    check(
      "8. owner: подпись doctor A2 установлена через /admin",
      !!doctorA2AfterAdmin.signatureUrl && doctorA2AfterAdmin.signatureUrl.startsWith(`doctor-signatures/${clinicA.id}/${doctorA2Profile.id}/`),
    );
    check(
      "8c. audit: clinic-scoped (clinicId=clinicA, entityId=doctorA2)",
      !!(await prisma.auditLog.findFirst({
        where: { clinicId: clinicA.id, entityType: "doctor", entityId: doctorA2Profile.id, action: "update" },
      })),
    );

    // ── 9. doctor/assistant НЕ могут загрузить подпись ДРУГОГО врача (admin-only action) ──
    const doctorA2SignatureBefore = doctorA2AfterAdmin.signatureUrl;
    await doctorASession.postForm("/admin", adminSignatureFrag, {
      doctorId: doctorA2Profile.id,
      signature: { bytes: JPEG_BYTES, name: "hijack.jpg", mime: "image/jpeg" },
    });
    const doctorA2AfterDoctorAttempt = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorA2Profile.id } });
    check("9. doctor: чужая подпись не изменена (нет admin.manage)", doctorA2AfterDoctorAttempt.signatureUrl === doctorA2SignatureBefore);

    const assistantASession = new Session();
    check("9b. login assistant A", await assistantASession.login(assistantAEmail));
    await assistantASession.postForm("/admin", adminSignatureFrag, {
      doctorId: doctorA2Profile.id,
      signature: { bytes: JPEG_BYTES, name: "hijack2.jpg", mime: "image/jpeg" },
    });
    const doctorA2AfterAssistantAttempt = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorA2Profile.id } });
    check("9c. assistant: чужая подпись не изменена (нет admin.manage)", doctorA2AfterAssistantAttempt.signatureUrl === doctorA2SignatureBefore);

    // ── 10. cross-tenant: owner A не может загрузить подпись для doctor B (admin action) ──
    const doctorBBefore = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorBProfile.id } });
    check("10. doctor B изначально без подписи", doctorBBefore.signatureUrl === null);
    await ownerASession.postForm("/admin", adminSignatureFrag, {
      doctorId: doctorBProfile.id,
      signature: { bytes: PNG_BYTES, name: "cross.png", mime: "image/png" },
    });
    const doctorBAfter = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorBProfile.id } });
    check("10b. cross-tenant: owner A не может изменить подпись doctor B", doctorBAfter.signatureUrl === null);

    // ── 11. /api/doctor-signature: анонимный доступ, формат id, узкая tenant-изоляция ──
    const anon = new Session();
    const anonDl = await anon.getRaw(`/api/doctor-signature/${doctorAProfile.id}`);
    check("11. неавторизованный запрос → 403 (маршрут сам решает auth)", anonDl.status === 403);

    const badIdDl = await doctorASession.getRaw(`/api/doctor-signature/not-a-uuid`);
    check("11b. невалидный id → 404", badIdDl.status === 404);

    // doctor A2 (другой врач, та же клиника, НЕ self, НЕ admin.view) → 404
    const doctorAReadsDoctorA2 = await doctorASession.getRaw(`/api/doctor-signature/${doctorA2Profile.id}`);
    check("11c. doctor A читает подпись doctor A2 (та же клиника, не self, не admin) → 404", doctorAReadsDoctorA2.status === 404);

    // owner A (admin.view, та же клиника) → 200 (после шага 8)
    const ownerAReadsDoctorA2 = await ownerASession.getRaw(`/api/doctor-signature/${doctorA2Profile.id}`);
    check("11d. owner (admin.view, своя клиника) читает подпись doctor A2 → 200", ownerAReadsDoctorA2.status === 200);

    // cross-tenant: owner B читает подпись doctor A → 404
    const ownerBSession = new Session();
    check("11e. login owner B", await ownerBSession.login(ownerBEmail));
    const ownerBReadsDoctorA = await ownerBSession.getRaw(`/api/doctor-signature/${doctorAProfile.id}`);
    check("11f. cross-tenant: owner B читает подпись doctor A → 404", ownerBReadsDoctorA.status === 404);

    // нет подписи → 404 (doctor B, своя же клиника, сам читает)
    const doctorBSession = new Session();
    check("11g. login doctor B", await doctorBSession.login(doctorBEmail));
    const doctorBReadsOwn = await doctorBSession.getRaw(`/api/doctor-signature/${doctorBProfile.id}`);
    check("11h. doctor B: своя подпись (не загружена) → 404", doctorBReadsOwn.status === 404);

    // ── 12. super_admin: читает подпись любого врача (платформенное управление) ──
    const superSession = new Session();
    check("12. login super_admin (alias 'super')", await superSession.login("super", process.env.SEED_DEMO_PASSWORD ?? "Demo1234!"));
    const superReadsDoctorA = await superSession.getRaw(`/api/doctor-signature/${doctorAProfile.id}`);
    check("12b. super_admin: читает подпись doctor A (чужой клиники) → 200", superReadsDoctorA.status === 200);

    // ── 13. raw-путь (relative storage path) не раскрывается (сессия 84-паттерн) ──
    const dl1Headers = JSON.stringify([...dl1.headers.entries()]);
    check(
      "13. заголовки /api/doctor-signature не содержат relative storage path",
      !dl1Headers.includes(firstUploadedSignatureUrl),
    );
    check(
      "13b. /settings использует /api/doctor-signature/{id} URL (не raw путь)",
      doctorSettingsPage2.html.includes(`/api/doctor-signature/${doctorAProfile.id}`),
    );
  } finally {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ clinicId: { in: clinicIds } }, { entityId: { in: [...userIds, ...doctorIds] } }] },
    });
    await prisma.doctor.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.user.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    for (const id of clinicIds) {
      await fs.rm(path.join(UPLOADS, "doctor-signatures", id), { recursive: true, force: true });
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
