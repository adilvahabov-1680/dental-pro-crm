/**
 * E2E-проверка встраивания подписи врача в PDF (сессия 87):
 *   npx tsx scripts/e2e-doctor-signature-pdf-check.ts
 * Требует dev-сервер + seed. Использует ТОЛЬКО эфемерные тестовые клиники
 * (E2E Sig-PDF Clinic A/B) — demo-klinika не мутируется. Подпись для теста
 * пишется напрямую (saveUploadFile + Doctor.update), без прохождения формы
 * загрузки — сам upload-flow уже покрыт e2e-doctor-signature-check.ts; здесь
 * проверяется именно встраивание в «Müalicə çıxarışı» (lib/pdf.ts +
 * lib/pdfSignature.ts): подпись рисуется только когда у patient.primaryDoctor
 * есть валидная PNG/JPEG-подпись СВОЕЙ клиники; WebP/повреждённый файл/
 * отсутствующий файл/чужая клиника — секция безопасно пропускается, без
 * краша генерации. Наличие встроенного изображения проверяется по маркеру
 * "/Subtype /Image" в сырых байтах PDF (других изображений в этом шаблоне
 * нет — проверено отдельно: pdfkit пишет именно такую строку для XObject).
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
  async postForm(p: string, pageHtml: string, fields: Record<string, string>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
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

/** Фрагмент формы генерации «Müalicə çıxarışı» (маркер — поле patientId). */
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

async function pdfRawBytes(relFileUrl: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOADS, relFileUrl));
}

/** pdfkit пишет встроенные изображения как XObject с этим маркером (проверено отдельно). */
function hasEmbeddedImage(buf: Buffer): boolean {
  return buf.toString("latin1").includes("/Subtype /Image");
}

// Полноценный валидный 1×1 PNG (IHDR+IDAT+IEND с корректными CRC) — для
// happy-path: pdfkit должен реально ДЕКОДИРОВАТЬ и встроить изображение,
// а не просто пройти проверку магических байт.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
// Магические байты валидны (sniffUploadMime распознаёт как image/png), но
// структура усечена (нет IDAT/IEND) — pdfkit-декодер бросает исключение
// при попытке встроить. Проверяем, что секция подписи просто пропускается
// (см. try/catch в lib/pdf.ts), а не валит генерацию документа.
const TRUNCATED_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]),
]);
// Минимальный валидный WebP (RIFF....WEBP) — sniffUploadMime распознаёт его
// как image/webp, но pdfkit не умеет встраивать WebP (нет декодера).
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 ", "ascii"),
  Buffer.alloc(10, 0),
]);
const TEXT_BYTES = Buffer.from("this is not an image — invalid signature content");

async function genTreatmentSummary(
  session: Session,
  patientId: string,
): Promise<{ recordId: string | null; status: number }> {
  const page = await session.get(`/patients/${patientId}/documents`);
  const frag = formFragment(page.html, 'name="patientId"');
  const res = await session.postForm(`/patients/${patientId}/documents`, frag, { patientId });
  const recordId = (res.location ?? "").match(/\/documents\/([0-9a-f-]{36})/)?.[1] ?? null;
  return { recordId, status: res.status };
}

async function main() {
  console.log(`E2E doctor signature PDF check → ${BASE}\n`);

  const ts = Date.now();
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const doctorRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "doctor" } });
  const passwordHash = await bcrypt.hash(E2E_PASS, 10);

  const clinicA = await prisma.clinic.create({
    data: { name: `E2E Sig-PDF Clinic A ${ts}`, slug: `e2e-sig-pdf-clinic-a-${ts}`, status: "active" },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: `E2E Sig-PDF Clinic B ${ts}`, slug: `e2e-sig-pdf-clinic-b-${ts}`, status: "active" },
  });

  const ownerA = await prisma.user.create({
    data: {
      clinicId: clinicA.id, roleId: ownerRole.id,
      email: `e2e-sigpdf-owner-a-${ts}@test.dentalpro.az`, fullName: "E2E SigPdf Owner A",
      passwordHash, locale: "az",
    },
  });

  async function makeDoctor(clinicId: string, label: string) {
    const u = await prisma.user.create({
      data: {
        clinicId, roleId: doctorRole.id,
        email: `e2e-sigpdf-${label}-${ts}@test.dentalpro.az`, fullName: `E2E SigPdf Dr ${label} ${ts}`,
        passwordHash, locale: "az",
      },
    });
    const d = await prisma.doctor.create({ data: { clinicId, userId: u.id } });
    return d;
  }

  const doctorWithSig = await makeDoctor(clinicA.id, "withsig");
  const doctorNoSig = await makeDoctor(clinicA.id, "nosig");
  const doctorMissingFile = await makeDoctor(clinicA.id, "missingfile");
  const doctorInvalidContent = await makeDoctor(clinicA.id, "invalidcontent");
  const doctorWebp = await makeDoctor(clinicA.id, "webp");
  const doctorTruncated = await makeDoctor(clinicA.id, "truncated");
  const doctorB = await makeDoctor(clinicB.id, "clinicb");

  // подпись пишется напрямую (минуя форму загрузки — она покрыта другим e2e)
  const sigUrlWithSig = `doctor-signatures/${clinicA.id}/${doctorWithSig.id}/sig.png`;
  await fs.mkdir(path.join(UPLOADS, path.dirname(sigUrlWithSig)), { recursive: true });
  await fs.writeFile(path.join(UPLOADS, sigUrlWithSig), PNG_BYTES);
  await prisma.doctor.update({ where: { id: doctorWithSig.id }, data: { signatureUrl: sigUrlWithSig } });

  const sigUrlMissing = `doctor-signatures/${clinicA.id}/${doctorMissingFile.id}/nonexistent.png`;
  await prisma.doctor.update({ where: { id: doctorMissingFile.id }, data: { signatureUrl: sigUrlMissing } });
  // файл сознательно НЕ создаётся — проверяем graceful skip

  const sigUrlInvalid = `doctor-signatures/${clinicA.id}/${doctorInvalidContent.id}/fake.png`;
  await fs.mkdir(path.join(UPLOADS, path.dirname(sigUrlInvalid)), { recursive: true });
  await fs.writeFile(path.join(UPLOADS, sigUrlInvalid), TEXT_BYTES);
  await prisma.doctor.update({ where: { id: doctorInvalidContent.id }, data: { signatureUrl: sigUrlInvalid } });

  const sigUrlWebp = `doctor-signatures/${clinicA.id}/${doctorWebp.id}/sig.webp`;
  await fs.mkdir(path.join(UPLOADS, path.dirname(sigUrlWebp)), { recursive: true });
  await fs.writeFile(path.join(UPLOADS, sigUrlWebp), WEBP_BYTES);
  await prisma.doctor.update({ where: { id: doctorWebp.id }, data: { signatureUrl: sigUrlWebp } });

  const sigUrlTruncated = `doctor-signatures/${clinicA.id}/${doctorTruncated.id}/truncated.png`;
  await fs.mkdir(path.join(UPLOADS, path.dirname(sigUrlTruncated)), { recursive: true });
  await fs.writeFile(path.join(UPLOADS, sigUrlTruncated), TRUNCATED_PNG_BYTES);
  await prisma.doctor.update({ where: { id: doctorTruncated.id }, data: { signatureUrl: sigUrlTruncated } });

  const sigUrlCrossClinic = `doctor-signatures/${clinicB.id}/${doctorB.id}/sig.png`;
  await fs.mkdir(path.join(UPLOADS, path.dirname(sigUrlCrossClinic)), { recursive: true });
  await fs.writeFile(path.join(UPLOADS, sigUrlCrossClinic), PNG_BYTES);
  await prisma.doctor.update({ where: { id: doctorB.id }, data: { signatureUrl: sigUrlCrossClinic } });

  async function makePatient(primaryDoctorId: string | null, label: string) {
    return prisma.patient.create({
      data: {
        clinicId: clinicA.id, firstName: `SigPdf-${label}`, lastName: `E2E${ts}`,
        primaryDoctorId,
      },
    });
  }

  const patientWithSig = await makePatient(doctorWithSig.id, "withsig");
  const patientNoSig = await makePatient(doctorNoSig.id, "nosig");
  const patientNoDoctor = await makePatient(null, "nodoctor");
  const patientMissingFile = await makePatient(doctorMissingFile.id, "missing");
  const patientInvalidContent = await makePatient(doctorInvalidContent.id, "invalid");
  const patientWebp = await makePatient(doctorWebp.id, "webp");
  const patientTruncated = await makePatient(doctorTruncated.id, "truncated");
  // cross-tenant: пациент клиники A, но primaryDoctorId — врач клиники B
  // (симулирует гипотетическую рассинхронизацию; обычный флоу назначения
  // врача такого не допускает — проверяем defense-in-depth на уровне PDF)
  const patientCrossClinic = await makePatient(doctorB.id, "cross");

  const clinicIds = [clinicA.id, clinicB.id];
  const patientIds = [
    patientWithSig.id, patientNoSig.id, patientNoDoctor.id, patientMissingFile.id,
    patientInvalidContent.id, patientWebp.id, patientTruncated.id, patientCrossClinic.id,
  ];
  const userIds = [ownerA.id, doctorWithSig.userId, doctorNoSig.userId, doctorMissingFile.userId,
    doctorInvalidContent.userId, doctorWebp.userId, doctorTruncated.userId, doctorB.userId];
  const createdFiles: string[] = [];
  const createdRecordIds: string[] = [];

  try {
    const ownerASession = new Session();
    check("1. login owner A", await ownerASession.login(ownerA.email));

    // ── 2. валидная подпись своей клиники → встроена ──
    const r1 = await genTreatmentSummary(ownerASession, patientWithSig.id);
    check("2. PDF с подписью: генерация → recordId получен", !!r1.recordId, `status=${r1.status}`);
    if (r1.recordId) {
      createdRecordIds.push(r1.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r1.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("2b. PDF содержит встроенное изображение (/Subtype /Image)", hasEmbeddedImage(buf));
      const text = buf.toString("latin1");
      check("2c. raw-путь подписи НЕ встречается в PDF", !text.includes(sigUrlWithSig));
    }

    // ── 3. нет подписи у врача → секция не рисуется, генерация ОК ──
    const r2 = await genTreatmentSummary(ownerASession, patientNoSig.id);
    check("3. PDF без подписи: генерация → recordId получен", !!r2.recordId, `status=${r2.status}`);
    if (r2.recordId) {
      createdRecordIds.push(r2.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r2.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("3b. PDF без подписи: изображения нет", !hasEmbeddedImage(buf));
    }

    // ── 4. нет primaryDoctor вообще → без краша, без подписи ──
    const r3 = await genTreatmentSummary(ownerASession, patientNoDoctor.id);
    check("4. PDF без врача: генерация → recordId получен (без краша)", !!r3.recordId, `status=${r3.status}`);
    if (r3.recordId) {
      createdRecordIds.push(r3.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r3.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("4b. PDF без врача: изображения нет", !hasEmbeddedImage(buf));
    }

    // ── 5. signatureUrl указывает на отсутствующий файл → без краша ──
    const r4 = await genTreatmentSummary(ownerASession, patientMissingFile.id);
    check("5. отсутствующий файл подписи: генерация без краша", !!r4.recordId, `status=${r4.status}`);
    if (r4.recordId) {
      createdRecordIds.push(r4.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r4.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("5b. отсутствующий файл: изображения нет (graceful skip)", !hasEmbeddedImage(buf));
    }

    // ── 6. signatureUrl указывает на файл с некорректным содержимым → без краша ──
    const r5 = await genTreatmentSummary(ownerASession, patientInvalidContent.id);
    check("6. повреждённый файл подписи: генерация без краша", !!r5.recordId, `status=${r5.status}`);
    if (r5.recordId) {
      createdRecordIds.push(r5.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r5.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("6b. повреждённый файл: изображения нет (mime-sniff отклонил)", !hasEmbeddedImage(buf));
    }

    // ── 7. WebP-подпись (валидна для аватара/лого, но pdfkit её не поддерживает) ──
    const r6 = await genTreatmentSummary(ownerASession, patientWebp.id);
    check("7. WebP-подпись: генерация без краша", !!r6.recordId, `status=${r6.status}`);
    if (r6.recordId) {
      createdRecordIds.push(r6.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r6.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("7b. WebP-подпись: безопасно пропущена (pdfkit не поддерживает WebP)", !hasEmbeddedImage(buf));
    }

    // ── 8. cross-tenant: подпись врача ДРУГОЙ клиники не встраивается ──
    const r7 = await genTreatmentSummary(ownerASession, patientCrossClinic.id);
    check("8. cross-tenant primaryDoctor: генерация без краша", !!r7.recordId, `status=${r7.status}`);
    if (r7.recordId) {
      createdRecordIds.push(r7.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r7.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("8b. cross-tenant: подпись чужой клиники НЕ встроена", !hasEmbeddedImage(buf));
    }

    // ── 9. усечённый PNG (валидные magic bytes, но pdfkit-декодер бросает
    //      исключение при встраивании) → секция пропускается, без краша ──
    const r8 = await genTreatmentSummary(ownerASession, patientTruncated.id);
    check("9. усечённый PNG (mime валиден, декод невозможен): генерация без краша", !!r8.recordId, `status=${r8.status}`);
    if (r8.recordId) {
      createdRecordIds.push(r8.recordId);
      const rec = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: r8.recordId } });
      createdFiles.push(rec.fileUrl);
      const buf = await pdfRawBytes(rec.fileUrl);
      check("9b. усечённый PNG: изображения нет (поймано в lib/pdf.ts)", !hasEmbeddedImage(buf));
    }
  } finally {
    await prisma.pdfRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ clinicId: { in: clinicIds } }, { entityId: { in: [...patientIds, ...userIds] } }] },
    });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctor.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.user.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    for (const f of createdFiles) {
      await fs.unlink(path.join(UPLOADS, f)).catch(() => {});
    }
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
