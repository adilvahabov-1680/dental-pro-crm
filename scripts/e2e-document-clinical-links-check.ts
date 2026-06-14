/**
 * E2E-проверка клинических привязок документа (сессия 19):
 *   npx tsx scripts/e2e-document-clinical-links-check.ts
 * Требует dev-сервер + seed.
 *
 * Покрывает: привязка документа к зубу/процедуре при загрузке,
 * отображение бейджей в PatientDocumentsBlock / DocumentsList / /documents,
 * отображение документа в карточке зуба (ToothPanel) и процедуры (materials),
 * отклонение привязки к зубу/процедуре другого пациента (cross-patient =
 * cross-tenant защита), превью изображения через download-route,
 * скрытие удалённых документов из привязанных списков.
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

/** Убирает React SSR comment-разделители между текстовыми узлами (`{a} {b}` → `a<!-- --> <!-- -->b`). */
function norm(html: string): string {
  return html.replace(/<!--\s*-->/g, "");
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

async function main() {
  console.log(`E2E document clinical links check → ${BASE}\n`);

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { slug: "demo-klinika" } });
  const resad = await prisma.patient.findFirstOrThrow({ where: { phone: "+994501112233" } });
  const tural = await prisma.patient.findFirstOrThrow({ where: { phone: "+994703334455" } });

  const tooth16 = await prisma.toothRecord.findFirstOrThrow({
    where: { patientId: resad.id, toothNumber: 16, deletedAt: null },
  });
  const treatment16 = await prisma.treatmentItem.findFirstOrThrow({
    where: { patientId: resad.id, toothNumber: 16, deletedAt: null },
    include: { service: true },
  });
  const anyUser = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id } });
  let turalChart = await prisma.dentalChart.findFirst({
    where: { clinicId: clinic.id, patientId: tural.id },
  });
  if (!turalChart) {
    turalChart = await prisma.dentalChart.create({
      data: { clinicId: clinic.id, patientId: tural.id, chartType: "adult" },
    });
  }
  let turalTooth = await prisma.toothRecord.findFirst({
    where: { patientId: tural.id, deletedAt: null },
  });
  if (!turalTooth) {
    turalTooth = await prisma.toothRecord.create({
      data: {
        clinicId: clinic.id,
        patientId: tural.id,
        dentalChartId: turalChart.id,
        toothNumber: 11,
        updatedById: anyUser.id,
      },
    });
  }

  const cleanupDocs = async () => {
    const docs = await prisma.document.findMany({ where: { title: { startsWith: "E2E-LINK" } } });
    for (const d of docs) {
      await fs.rm(path.join(UPLOADS, d.fileUrl), { force: true });
      await prisma.document.delete({ where: { id: d.id } });
    }
  };
  await cleanupDocs();

  const createdFiles: string[] = [];
  try {
    const owner = new Session();
    check("login owner", await owner.login("admin@demo.dentalpro.az"));

    // ── 1. загрузка с привязкой к зубу 16 ──
    const pDocsPage = await owner.get(`/patients/${resad.id}/documents`);
    const toothLabel = `Diş ${tooth16.toothNumber}`;
    check("форма содержит опцию зуба (Dişlə əlaqələndir)", pDocsPage.html.includes(toothLabel));
    const uploadFrag = formFragment(pDocsPage.html, "data-upload-form");

    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag, {
      patientId: resad.id,
      type: "xray",
      title: "E2E-LINK tooth-doc",
      toothRecordId: tooth16.id,
      file: { bytes: PDF_BYTES, name: "tooth16.pdf", mime: "application/pdf" },
    });
    const toothDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-LINK tooth-doc" },
    });
    check("1. документ создан с привязкой toothRecordId", !!toothDoc && toothDoc.toothRecordId === tooth16.id);
    if (toothDoc) createdFiles.push(toothDoc.fileUrl);

    // ── 2. бейдж «Diş 16» в PatientDocumentsBlock ──
    const patientPage = await owner.get(`/patients/${resad.id}`);
    check(
      "2. PatientDocumentsBlock: бейдж «Diş 16»",
      patientPage.html.includes("E2E-LINK tooth-doc") && norm(patientPage.html).includes("Diş 16"),
    );

    // ── 3. бейдж на /patients/[id]/documents ──
    const pDocsAfter = await owner.get(`/patients/${resad.id}/documents`);
    check(
      "3. /patients/[id]/documents: бейдж «Diş 16»",
      pDocsAfter.html.includes("E2E-LINK tooth-doc") && norm(pDocsAfter.html).includes("Diş 16"),
    );

    // ── 4. бейдж на /documents ──
    const docsPage = await owner.get("/documents");
    check(
      "4. /documents: бейдж «Diş 16»",
      docsPage.html.includes("E2E-LINK tooth-doc") && norm(docsPage.html).includes("Diş 16"),
    );

    // ── 5. отображение в контексте зуба (ToothPanel) ──
    const dentalChartPage = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
    check(
      "5. ToothPanel (?tooth=16) показывает привязанный документ",
      dentalChartPage.html.includes("E2E-LINK tooth-doc"),
    );

    // ── 6. загрузка с привязкой к процедуре (toothRecordId=16 + treatmentItemId) ──
    const pDocsPage2 = await owner.get(`/patients/${resad.id}/documents`);
    const uploadFrag2 = formFragment(pDocsPage2.html, "data-upload-form");
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag2, {
      patientId: resad.id,
      type: "other",
      title: "E2E-LINK treatment-doc",
      treatmentItemId: treatment16.id,
      file: { bytes: PDF_BYTES, name: "treatment16.pdf", mime: "application/pdf" },
    });
    const treatmentDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-LINK treatment-doc" },
    });
    check(
      "6. документ создан с привязкой treatmentItemId",
      !!treatmentDoc && treatmentDoc.treatmentItemId === treatment16.id,
    );
    if (treatmentDoc) createdFiles.push(treatmentDoc.fileUrl);

    // ── 7. бейдж «Müalicə: <service>» ──
    const docsPage2 = await owner.get("/documents");
    check(
      "7. /documents: бейдж «Müalicə: " + treatment16.service.name + "»",
      docsPage2.html.includes("E2E-LINK treatment-doc") &&
        norm(docsPage2.html).includes(`Müalicə: ${treatment16.service.name}`),
    );

    // ── 8. отображение в карточке процедуры (materials) ──
    const materialsPage = await owner.get(`/treatments/${treatment16.id}/materials`);
    check("8. страница материалов процедуры показывает привязанный документ",
      materialsPage.html.includes("E2E-LINK treatment-doc"));

    // ── 9. cross-patient: привязка к зубу другого пациента отклонена ──
    const pDocsPage3 = await owner.get(`/patients/${resad.id}/documents`);
    const uploadFrag3 = formFragment(pDocsPage3.html, "data-upload-form");
    const countBefore = await prisma.document.count({ where: { clinicId: clinic.id } });
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag3, {
      patientId: resad.id,
      type: "other",
      title: "E2E-LINK cross-patient-tooth",
      toothRecordId: turalTooth.id, // зуб другого пациента
      file: { bytes: PDF_BYTES, name: "cross.pdf", mime: "application/pdf" },
    });
    check(
      "9. привязка к зубу другого пациента отклонена",
      (await prisma.document.count({ where: { clinicId: clinic.id } })) === countBefore,
    );

    // ── 10. cross-tenant: произвольный id из другой клиники отклонён ──
    const clinicB = await prisma.clinic.create({
      data: { name: "E2E Link B", slug: "e2e-link-clinic-b", status: "active" },
    });
    const patientB = await prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: "Kamran", lastName: "E2ELinkB" },
    });
    const chartB = await prisma.dentalChart.create({
      data: { clinicId: clinicB.id, patientId: patientB.id, chartType: "adult" },
    });
    const toothB = await prisma.toothRecord.create({
      data: {
        clinicId: clinicB.id,
        patientId: patientB.id,
        dentalChartId: chartB.id,
        toothNumber: 11,
        updatedById: anyUser.id,
      },
    });
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag3, {
      patientId: resad.id,
      type: "other",
      title: "E2E-LINK cross-tenant-tooth",
      toothRecordId: toothB.id, // зуб из другой клиники
      file: { bytes: PDF_BYTES, name: "cross-tenant.pdf", mime: "application/pdf" },
    });
    check(
      "10. привязка к зубу из другой клиники отклонена",
      (await prisma.document.count({ where: { clinicId: clinic.id } })) === countBefore,
    );
    await prisma.toothRecord.delete({ where: { id: toothB.id } });
    await prisma.dentalChart.delete({ where: { id: chartB.id } });
    await prisma.patient.delete({ where: { id: patientB.id } });
    await prisma.clinic.delete({ where: { id: clinicB.id } });

    // ── 11. превью изображения ──
    const pDocsPage4 = await owner.get(`/patients/${resad.id}/documents`);
    const uploadFrag4 = formFragment(pDocsPage4.html, "data-upload-form");
    await owner.postForm(`/patients/${resad.id}/documents`, uploadFrag4, {
      patientId: resad.id,
      type: "photo",
      title: "E2E-LINK preview-png",
      file: { bytes: PNG_BYTES, name: "preview.png", mime: "image/png" },
    });
    const pngDoc = await prisma.document.findFirst({
      where: { clinicId: clinic.id, title: "E2E-LINK preview-png" },
    });
    check("11a. PNG-документ создан", !!pngDoc && pngDoc.mimeType === "image/png");
    if (pngDoc) createdFiles.push(pngDoc.fileUrl);

    const dl = pngDoc ? await owner.getRaw(`/api/documents/${pngDoc.id}/download`) : null;
    check(
      "11b. download: content-type image/png, inline",
      !!dl && dl.status === 200 && dl.headers.get("content-type") === "image/png" &&
        (dl.headers.get("content-disposition") ?? "").startsWith("inline"),
    );
    const docsPage3 = await owner.get("/documents");
    check(
      "11c. список документов рендерит <img> превью",
      !!pngDoc && docsPage3.html.includes(`<img`) &&
        docsPage3.html.includes(`/api/documents/${pngDoc.id}/download`),
    );

    // ── 12. удалённый документ скрыт из контекстных списков ──
    const delFrag = formFragment(
      (await owner.get(`/patients/${resad.id}/documents`)).html,
      `data-del="${toothDoc!.id}"`,
    );
    await owner.postForm(`/patients/${resad.id}/documents`, delFrag, { documentId: toothDoc!.id });
    const deletedDoc = await prisma.document.findUniqueOrThrow({ where: { id: toothDoc!.id } });
    check("12a. soft-delete: deletedAt установлен", deletedDoc.deletedAt !== null);

    const dentalChartAfter = await owner.get(`/patients/${resad.id}/dental-chart?tooth=16`);
    check(
      "12b. ToothPanel: удалённый документ скрыт",
      !dentalChartAfter.html.includes("E2E-LINK tooth-doc"),
    );
    const docsPageAfter = await owner.get("/documents");
    check("12c. /documents: удалённый документ скрыт", !docsPageAfter.html.includes("E2E-LINK tooth-doc"));

    // ── 13. cleanup-скрипт: dry-run и execute ──
    const fileAbs = path.join(UPLOADS, deletedDoc.fileUrl);
    const existsBefore = await fs.access(fileAbs).then(() => true).catch(() => false);
    check("13a. перед cleanup: физический файл на диске присутствует", existsBefore);
    // dry-run проверяется отдельно (npx tsx scripts/cleanup-deleted-documents.ts) —
    // здесь только готовим почву: документ soft-deleted, файл существует.
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
