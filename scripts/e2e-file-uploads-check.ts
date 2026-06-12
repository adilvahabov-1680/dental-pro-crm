/**
 * E2E-проверка загрузки файлов пациента (сессия 14):
 *   npx tsx scripts/e2e-file-uploads-check.ts
 * Требует dev-сервер + seed. Загрузка — POST multipart формы server action
 * (фрагмент формы по data-upload-form). Контент валидируется на сервере
 * по магическим байтам; проверяются tenant/scope/permissions/traversal.
 * Регрессия генерации PDF — отдельным прогоном e2e-documents-check.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
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
  async get(path: string) {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  async getRaw(path: string) {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return res;
  }
  /** POST формы server action; поля-файлы передаются как { bytes, name, mime }. */
  async postForm(
    path: string,
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

/** Фрагмент конкретной формы по маркеру внутри неё. */
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]),
]);
const TEXT_BYTES = Buffer.from("hello, this is plain text — not allowed");
const SCRIPT_BYTES = Buffer.from("#!/bin/sh\necho pwned\n");

async function main() {
  console.log(`E2E file uploads check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });

  // остатки прошлых прогонов
  const cleanupDocs = async () => {
    const docs = await prisma.document.findMany({ where: { title: { startsWith: "E2E-UPL" } } });
    for (const d of docs) {
      await fs.rm(path.join(UPLOADS, d.fileUrl), { force: true });
      await prisma.document.delete({ where: { id: d.id } });
    }
  };
  await cleanupDocs();
  const oldB = await prisma.clinic.findUnique({ where: { slug: "e2e-upl-clinic-b" } });
  if (oldB) {
    await prisma.document.deleteMany({ where: { clinicId: oldB.id } });
    await prisma.patient.deleteMany({ where: { clinicId: oldB.id } });
    await prisma.clinic.delete({ where: { id: oldB.id } });
  }

  const createdFiles: string[] = [];
  try {
    // ── 1. owner: страница и форма ──
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));
    const pDocsPage = await owner.get(`/patients/${resad.id}/documents`);
    check("страница документов пациента: форма «Sənəd yüklə»",
      pDocsPage.html.includes("Sənəd yüklə") && pDocsPage.html.includes("data-upload-form"));
    const uploadFrag = formFragment(pDocsPage.html, "data-upload-form");

    // ── 2. загрузка PDF ──
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "xray",
      title: "E2E-UPL Rentgen 16",
      file: { bytes: PDF_BYTES, name: "rentgen-16.pdf", mime: "application/pdf" },
    });
    const pdfDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-UPL Rentgen 16" },
    });
    check("document создан (type xray, mime по содержимому, размер)",
      !!pdfDoc && pdfDoc.type === "xray" && pdfDoc.mimeType === "application/pdf" &&
      pdfDoc.fileSize === PDF_BYTES.length && pdfDoc.patientId === resad.id);
    if (pdfDoc) createdFiles.push(pdfDoc.fileUrl);
    check("имя файла сгенерировано сервером (uploaded/, без client filename)",
      !!pdfDoc &&
      new RegExp(`^documents/${clinic.id}/${resad.id}/uploaded/xray-\\d{8}-[0-9a-f]{8}\\.pdf$`)
        .test(pdfDoc.fileUrl));
    const onDisk = pdfDoc ? await fs.readFile(path.join(UPLOADS, pdfDoc.fileUrl)) : null;
    check("файл на диске, байты совпадают", !!onDisk && onDisk.equals(PDF_BYTES));
    check("audit: document create",
      !!pdfDoc &&
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "document", entityId: pdfDoc.id, action: "create" },
      })));

    // ── 3. отображение ──
    const patientPage = await owner.get(`/patients/${resad.id}`);
    check("блок Sənədlər на карточке пациента показывает файл",
      patientPage.html.includes("E2E-UPL Rentgen 16"));
    const docsPage = await owner.get("/documents");
    check("/documents показывает загруженный файл (с меткой Rentgen şəkli)",
      docsPage.html.includes("E2E-UPL Rentgen 16") && docsPage.html.includes("Rentgen şəkli"));
    const filteredIn = await owner.get("/documents?type=xray");
    const filteredOut = await owner.get("/documents?type=consent");
    check("фильтр по типу: xray показывает, consent скрывает",
      filteredIn.html.includes("E2E-UPL Rentgen 16") &&
      !filteredOut.html.includes("E2E-UPL Rentgen 16"));
    const pDocsPage2 = await owner.get(`/patients/${resad.id}/documents`);
    check("история документов пациента показывает файл",
      pDocsPage2.html.includes("E2E-UPL Rentgen 16"));

    // ── 4. download route ──
    const dl = pdfDoc ? await owner.getRaw(`/api/documents/${pdfDoc.id}/download`) : null;
    const dlBytes = dl && dl.status === 200 ? Buffer.from(await dl.arrayBuffer()) : null;
    check("download: 200, content-type application/pdf, inline",
      !!dl && dl.status === 200 &&
      dl.headers.get("content-type") === "application/pdf" &&
      (dl.headers.get("content-disposition") ?? "").startsWith("inline"));
    check("download: байты совпадают", !!dlBytes && dlBytes.equals(PDF_BYTES));

    // ── 5. PNG: mime сниффится по содержимому, title = имя файла ──
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "photo",
      title: "",
      file: { bytes: PNG_BYTES, name: "E2E-UPL-foto.png", mime: "application/octet-stream" },
    });
    const pngDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-UPL-foto.png" },
    });
    check("PNG: mime определён по байтам (клиент прислал octet-stream)",
      !!pngDoc && pngDoc.mimeType === "image/png" && pngDoc.fileUrl.endsWith(".png"));
    check("PNG: пустой заголовок → оригинальное имя файла",
      !!pngDoc && pngDoc.title === "E2E-UPL-foto.png");
    if (pngDoc) createdFiles.push(pngDoc.fileUrl);

    // ── 6. отклонения ──
    const countBefore = await prisma.document.count({ where: { clinicId: clinic.id } });
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "other",
      title: "E2E-UPL text",
      file: { bytes: TEXT_BYTES, name: "notes.txt", mime: "text/plain" },
    });
    check("text/plain отклонён",
      (await prisma.document.count({ where: { clinicId: clinic.id } })) === countBefore);

    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "other",
      title: "E2E-UPL fake-pdf",
      file: { bytes: SCRIPT_BYTES, name: "evil.pdf", mime: "application/pdf" },
    });
    check("подделка mime (скрипт с заголовком application/pdf) отклонена",
      (await prisma.document.count({ where: { clinicId: clinic.id } })) === countBefore);

    const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024, 0x20)]);
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "other",
      title: "E2E-UPL big",
      file: { bytes: oversized, name: "big.pdf", mime: "application/pdf" },
    });
    check("файл больше 10 MB отклонён",
      (await prisma.document.count({ where: { clinicId: clinic.id } })) === countBefore);

    // ── 7. path traversal через имя файла ──
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "other",
      title: "",
      file: { bytes: PDF_BYTES, name: "..\\..\\E2E-UPL-evil.pdf", mime: "application/pdf" },
    });
    const evilDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: { contains: "E2E-UPL-evil" } },
    });
    check("traversal-имя: заголовок очищен, путь серверный (uploaded/)",
      !!evilDoc && evilDoc.title === "E2E-UPL-evil.pdf" &&
      evilDoc.fileUrl.includes("/uploaded/") && !evilDoc.fileUrl.includes(".."));
    const escaped = await fs
      .access(path.join(UPLOADS, "..", "E2E-UPL-evil.pdf"))
      .then(() => true)
      .catch(() => false);
    check("traversal-имя: файл не вышел за пределы uploads/", !escaped);
    if (evilDoc) createdFiles.push(evilDoc.fileUrl);

    // ── 8. permissions / scope ──
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    await hekim.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "consent",
      title: "E2E-UPL hekim-oz",
      file: { bytes: PDF_BYTES, name: "consent.pdf", mime: "application/pdf" },
    });
    const docByDoctor = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-UPL hekim-oz" },
    });
    check("doctor: загрузка своему пациенту разрешена", !!docByDoctor);
    if (docByDoctor) createdFiles.push(docByDoctor.fileUrl);

    await hekim.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: tural.id, // вне scope врача (без primaryDoctor)
      type: "consent",
      title: "E2E-UPL hekim-cuzaq",
      file: { bytes: PDF_BYTES, name: "x.pdf", mime: "application/pdf" },
    });
    check("doctor: пациент вне scope → загрузка отклонена",
      (await prisma.document.findFirst({
        where: { title: "E2E-UPL hekim-cuzaq" },
      })) === null);

    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    await asst.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "other",
      title: "E2E-UPL asst",
      file: { bytes: PDF_BYTES, name: "a.pdf", mime: "application/pdf" },
    });
    check("assistant: загрузка отклонена (нет documents.manage)",
      (await prisma.document.findFirst({ where: { title: "E2E-UPL asst" } })) === null);
    const asstDl = pdfDoc ? await asst.getRaw(`/api/documents/${pdfDoc.id}/download`) : null;
    check("assistant: download → 403 (нет documents.view)", !!asstDl && asstDl.status === 403);

    // ── 8b. soft-delete (сессия 14.5) ──
    // удаляем PNG-документ; PDF-документ остаётся для cross-tenant проверок
    const pDocsPage3 = await owner.get(`/patients/${resad.id}/documents`);
    check("кнопка Sil видна (owner, uploaded)", pDocsPage3.html.includes("data-del"));
    const delFrag = formFragment(pDocsPage3.html, `data-del="${pngDoc!.id}"`);

    // assistant: удаление отклонено (нет documents.manage)
    await asst.postForm(`/patients/${resad.id}/documents`, delFrag, {
      documentId: pngDoc!.id,
    });
    const afterAsstDel = await prisma.document.findUniqueOrThrow({ where: { id: pngDoc!.id } });
    check("assistant: удаление отклонено", afterAsstDel.deletedAt === null);

    // owner: удаление проходит
    await owner.postForm(`/patients/${resad.id}/documents`, delFrag, {
      documentId: pngDoc!.id,
    });
    const deleted = await prisma.document.findUniqueOrThrow({ where: { id: pngDoc!.id } });
    check("soft-delete: deletedAt установлен", deleted.deletedAt !== null);
    check("audit: document delete",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "document", entityId: pngDoc!.id, action: "delete" },
      })));
    const fileStays = await fs
      .access(path.join(UPLOADS, pngDoc!.fileUrl))
      .then(() => true)
      .catch(() => false);
    check("v1: физический файл остаётся на диске", fileStays);

    // скрыт во всех списках
    const patientPageAfter = await owner.get(`/patients/${resad.id}`);
    check("блок пациента: удалённый скрыт", !patientPageAfter.html.includes("E2E-UPL-foto.png"));
    const docsAfter = await owner.get("/documents");
    check("/documents: удалённый скрыт", !docsAfter.html.includes("E2E-UPL-foto.png"));
    const pDocsAfter = await owner.get(`/patients/${resad.id}/documents`);
    check("история пациента: удалённый скрыт", !pDocsAfter.html.includes("E2E-UPL-foto.png"));

    // download удалённого → 404
    const dlDeleted = await owner.getRaw(`/api/documents/${pngDoc!.id}/download`);
    check("download удалённого → 404", dlDeleted.status === 404);

    // повторное удаление — идемпотентно (deletedAt не меняется)
    const firstDeletedAt = deleted.deletedAt!.getTime();
    await owner.postForm(`/patients/${resad.id}/documents`, delFrag, {
      documentId: pngDoc!.id,
    });
    const redeleted = await prisma.document.findUniqueOrThrow({ where: { id: pngDoc!.id } });
    check("повторное удаление идемпотентно", redeleted.deletedAt!.getTime() === firstDeletedAt);

    // upload после внедрения delete по-прежнему работает + PDF-док жив
    const dlStill = await owner.getRaw(`/api/documents/${pdfDoc!.id}/download`);
    check("неудалённый uploaded-документ по-прежнему скачивается", dlStill.status === 200);

    // ── 9. tenant-изоляция ──
    const clinicB = await prisma.clinic.create({
      data: { name: "E2E Upl B", slug: "e2e-upl-clinic-b", status: "active" },
    });
    const patientB = await prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: "Kamran", lastName: "E2EUplB" },
    });
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: patientB.id,
      type: "other",
      title: "E2E-UPL cross-tenant",
      file: { bytes: PDF_BYTES, name: "x.pdf", mime: "application/pdf" },
    });
    check("cross-tenant: загрузка чужому пациенту отклонена",
      (await prisma.document.findFirst({ where: { title: "E2E-UPL cross-tenant" } })) === null);

    const docB = await prisma.document.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientB.id,
        type: "other",
        title: "E2E-UPL doc-b",
        fileUrl: `documents/${clinicB.id}/${patientB.id}/uploaded/other-x.pdf`,
        mimeType: "application/pdf",
        fileSize: 10,
        uploadedById: (await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id } })).id,
      },
    });
    const crossDl = await owner.getRaw(`/api/documents/${docB.id}/download`);
    check("cross-tenant: download чужого документа → 404", crossDl.status === 404);

    // cross-tenant: удаление чужого документа отклонено
    const delFragB = formFragment(
      (await owner.get(`/patients/${resad.id}/documents`)).html,
      `data-del="${pdfDoc!.id}"`,
    );
    await owner.postForm(`/patients/${resad.id}/documents`, delFragB, {
      documentId: docB.id,
    });
    const docBAfter = await prisma.document.findUniqueOrThrow({ where: { id: docB.id } });
    check("cross-tenant: удаление чужого документа отклонено", docBAfter.deletedAt === null);

    // cleanup tenant B
    await prisma.document.delete({ where: { id: docB.id } });
    await prisma.patient.delete({ where: { id: patientB.id } });
    await prisma.clinic.delete({ where: { id: clinicB.id } });
  } finally {
    await cleanupDocs();
    for (const f of createdFiles) {
      await fs.rm(path.join(UPLOADS, f), { force: true });
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
