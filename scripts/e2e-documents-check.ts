/**
 * E2E-проверка модуля Sənədlər / PDF v1 (dev-скрипт):
 *   npx tsx scripts/e2e-documents-check.ts
 * Требует dev-сервер + seed. Текст PDF проверяется через pdf-parse
 * (шрифт встраивается subset'ом — raw-байты не содержат plain text).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PDFParse } from "pdf-parse";

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
  /** raw-ответ (для бинарного PDF). */
  async getRaw(path: string) {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return res;
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

/** Фрагмент конкретной формы по маркеру внутри неё (на странице их несколько). */
function formFragment(html: string, marker: string): string {
  const idx = html.indexOf(marker);
  if (idx < 0) return html;
  const start = html.lastIndexOf("<form", idx);
  const end = html.indexOf("</form>", idx);
  return start < 0 || end < 0 ? html : html.slice(start, end);
}

async function pdfText(relFileUrl: string): Promise<string> {
  const buf = await fs.readFile(path.join(UPLOADS, relFileUrl));
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  console.log(`E2E documents check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });
  const seedInvoice = await prisma.invoice.findFirstOrThrow({
    where: { clinicId: clinic.id, notes: "demo-seed-invoice" },
  });

  const createdRecordIds: string[] = [];
  const createdFiles: string[] = [];

  // чужая клиника + её pdf_record
  const clinicB = await prisma.clinic.upsert({
    where: { slug: "e2e-doc-clinic-b" },
    update: {},
    create: { name: "E2E Doc B", slug: "e2e-doc-clinic-b", status: "active" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB.id, firstName: "Foreign", lastName: "E2EDoc" },
  });
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { email: "admin@demo.dentalpro.az" },
  });
  const recordB = await prisma.pdfRecord.create({
    data: {
      clinicId: clinicB.id,
      patientId: patientB.id,
      type: "extract",
      sourceEntity: "patient",
      sourceId: patientB.id,
      fileUrl: `documents/${clinicB.id}/${patientB.id}/e2e-foreign.pdf`,
      generatedById: adminUser.id,
    },
  });

  try {
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // 1. /documents больше не placeholder
    const listPage = await owner.get("/documents");
    check("/documents открывается без placeholder",
      listPage.status === 200 &&
        !listPage.html.includes("Hazırlanır") &&
        (listPage.html.includes("Sənəd tapılmadı") || listPage.html.includes("sənəd")));

    // 2-3. страницы пациента
    const pDocsPage = await owner.get(`/patients/${resad.id}/documents`);
    check("страница документов пациента открывается",
      pDocsPage.status === 200 && pDocsPage.html.includes("Müalicə çıxarışı yarat"));
    const patientPage = await owner.get(`/patients/${resad.id}`);
    check("блок Sənədlər на карточке пациента",
      patientPage.html.includes("Müalicə çıxarışı yarat") &&
        patientPage.html.includes("Bütün sənədlər"));

    // 4. генерация Müalicə çıxarışı
    const sumFrag = formFragment(pDocsPage.html, 'name="patientId"');
    const sumRes = await owner.postForm(`/patients/${resad.id}/documents`, sumFrag, {
      patientId: resad.id,
    });
    const sumDocId = (sumRes.location ?? "").match(/\/documents\/([0-9a-f-]{36})/)?.[1];
    check("generate summary → 303 на /documents/[id]", !!sumDocId, `got ${sumRes.status}`);

    // 5-6. запись + файл
    const sumRecord = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: sumDocId! } });
    createdRecordIds.push(sumRecord.id);
    createdFiles.push(sumRecord.fileUrl);
    check("pdf_record: type extract, patient связан",
      sumRecord.type === "extract" && sumRecord.patientId === resad.id &&
        sumRecord.clinicId === clinic.id);
    const sumStat = await fs.stat(path.join(UPLOADS, sumRecord.fileUrl)).catch(() => null);
    check("PDF файл создан в uploads/", !!sumStat && sumStat.size > 1000);

    // 7-8. содержимое PDF
    const sumText = await pdfText(sumRecord.fileUrl);
    check("PDF: имя пациента", sumText.includes("Həsənov") && sumText.includes("Rəşad"));
    check("PDF: заголовок Müalicə çıxarışı", sumText.includes("Müalicə çıxarışı"));
    check("PDF: процедура из истории", sumText.includes("Kariyes müalicəsi"));
    check("PDF: allergiya видна", sumText.includes("Penisilin"));

    // download route
    const dl = await owner.getRaw(`/api/documents/${sumRecord.id}/download`);
    check("download: 200 + application/pdf",
      dl.status === 200 && (dl.headers.get("content-type") ?? "").includes("application/pdf"));

    // детальная страница
    const detail = await owner.get(`/documents/${sumRecord.id}`);
    check("детальная страница документа", detail.html.includes("Müalicə çıxarışı"));

    // 19. audit
    check("audit_log: extract создан",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "pdf_record", entityId: sumRecord.id },
      })));

    // 10. генерация Hesab sənədi
    const invPage = await owner.get(`/finance/invoices/${seedInvoice.id}`);
    check("кнопка Hesab PDF yarat на счёте", invPage.html.includes("Hesab PDF yarat"));
    const invFrag = formFragment(invPage.html, "Hesab PDF yarat");
    const invRes = await owner.postForm(`/finance/invoices/${seedInvoice.id}`, invFrag, {
      invoiceId: seedInvoice.id,
    });
    const invDocId = (invRes.location ?? "").match(/\/documents\/([0-9a-f-]{36})/)?.[1];
    check("generate invoice PDF → 303", !!invDocId, `got ${invRes.status}`);
    const invRecord = await prisma.pdfRecord.findUniqueOrThrow({ where: { id: invDocId! } });
    createdRecordIds.push(invRecord.id);
    createdFiles.push(invRecord.fileUrl);
    check("pdf_record: type invoice_pdf, source = invoice",
      invRecord.type === "invoice_pdf" && invRecord.sourceId === seedInvoice.id);

    // 11-12. содержимое invoice PDF
    const invText = await pdfText(invRecord.fileUrl);
    check("invoice PDF: номер счёта", invText.includes("INV-0000"));
    check("invoice PDF: итоги (170 / 100 / 70)",
      invText.includes("170,00") && invText.includes("100,00") && invText.includes("70,00"));
    check("invoice PDF: оплата наличными в таблице", invText.includes("Nağd"));

    // 13. invoice pdf в документах пациента
    const pDocs2 = await owner.get(`/patients/${resad.id}/documents`);
    check("invoice PDF виден в документах пациента", pDocs2.html.includes("Hesab sənədi"));
    // 20. audit
    check("audit_log: invoice_pdf создан",
      !!(await prisma.auditLog.findFirst({
        where: { entityType: "pdf_record", entityId: invRecord.id },
      })));

    // 16-17. чужие patient/invoice блокированы
    const before = await prisma.pdfRecord.count();
    await owner.postForm(`/patients/${resad.id}/documents`, sumFrag, { patientId: patientB.id });
    check("чужой пациент: генерация блокирована",
      (await prisma.pdfRecord.count()) === before);
    const fake = "00000000-0000-4000-8000-000000000999";
    await owner.postForm(`/finance/invoices/${seedInvoice.id}`, invFrag, { invoiceId: fake });
    check("чужой/несуществующий счёт: генерация блокирована",
      (await prisma.pdfRecord.count()) === before);

    // 18. чужой документ: страница и download → 404
    const foreignDetail = await owner.get(`/documents/${recordB.id}`);
    check("чужой документ: страница 404/нет утечки",
      foreignDetail.status === 404 || !foreignDetail.html.includes("E2EDoc"));
    const foreignDl = await owner.getRaw(`/api/documents/${recordB.id}/download`);
    check("чужой документ: download блокирован", foreignDl.status === 404);

    // 9. doctor scope: чужой (не его) пациент клиники
    const hekim = new Session();
    check("login doctor", await hekim.login("hekim@demo.dentalpro.az"));
    await hekim.postForm(`/patients/${resad.id}/documents`, sumFrag, { patientId: tural.id });
    check("doctor: генерация для пациента вне scope блокирована",
      (await prisma.pdfRecord.count({ where: { patientId: tural.id } })) === 0);
    // документ пациента вне scope не открывается
    const turalRecord = await prisma.pdfRecord.create({
      data: {
        clinicId: clinic.id,
        patientId: tural.id,
        type: "extract",
        sourceEntity: "patient",
        sourceId: tural.id,
        fileUrl: `documents/${clinic.id}/${tural.id}/e2e-tural.pdf`,
        generatedById: adminUser.id,
      },
    });
    createdRecordIds.push(turalRecord.id);
    const hekimForeign = await hekim.get(`/documents/${turalRecord.id}`);
    check("doctor: документ вне scope → 404", hekimForeign.status === 404);
    const hekimForeignDl = await hekim.getRaw(`/api/documents/${turalRecord.id}/download`);
    check("doctor: download вне scope блокирован", hekimForeignDl.status === 404);

    // 14-15. assistant: нет manage и нет view
    const asst = new Session();
    check("login assistant", await asst.login("assistent@demo.dentalpro.az"));
    const beforeAsst = await prisma.pdfRecord.count();
    await asst.postForm(`/patients/${resad.id}/documents`, sumFrag, { patientId: resad.id });
    check("assistant: генерация отклонена (нет documents.manage)",
      (await prisma.pdfRecord.count()) === beforeAsst);
    const asstList = await asst.get("/documents");
    check("assistant: /documents недоступна (нет view)",
      asstList.status === 307 || asstList.status === 303 || !asstList.html.includes("Sənəd"));
    const asstDl = await asst.getRaw(`/api/documents/${sumRecord.id}/download`);
    check("assistant: download блокирован (403)", asstDl.status === 403);

    // 21. отсутствующий файл — graceful
    const missingRecord = await prisma.pdfRecord.create({
      data: {
        clinicId: clinic.id,
        patientId: resad.id,
        type: "extract",
        sourceEntity: "patient",
        sourceId: resad.id,
        fileUrl: `documents/${clinic.id}/${resad.id}/missing-file.pdf`,
        generatedById: adminUser.id,
      },
    });
    createdRecordIds.push(missingRecord.id);
    const missingDl = await owner.getRaw(`/api/documents/${missingRecord.id}/download`);
    check("missing file: download → 404 без краша", missingDl.status === 404);
    const missingDetail = await owner.get(`/documents/${missingRecord.id}`);
    check("missing file: страница показывает fileMissing",
      missingDetail.status === 200 && missingDetail.html.includes("PDF faylı tapılmadı"));
  } finally {
    // cleanup: e2e-записи, файлы, чужая клиника
    await prisma.pdfRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
    await prisma.pdfRecord.delete({ where: { id: recordB.id } }).catch(() => {});
    await prisma.patient.delete({ where: { id: patientB.id } }).catch(() => {});
    await prisma.clinic.delete({ where: { id: clinicB.id } }).catch(() => {});
    for (const f of createdFiles) {
      await fs.unlink(path.join(UPLOADS, f)).catch(() => {});
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
