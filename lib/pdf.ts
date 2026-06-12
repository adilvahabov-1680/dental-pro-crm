/**
 * Server-side PDF generation (pdfkit + DejaVu Sans для AZ-символов ə/ş/ğ/İ).
 * Два шаблона v1: «Müalicə çıxarışı» (по пациенту) и «Hesab sənədi» (по счёту).
 * Деньги в PDF — «AZN» (знак ₼ есть не во всех шрифтах/принтерах).
 * Только рендер в Buffer — storage и БД-записи в lib/actions/documents.ts.
 */
import path from "node:path";
import PDFDocument from "pdfkit";

const FONT = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const ACCENT = "#0E7490"; // печатный аналог accent (cyan-700)
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#D1D5DB";

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function formatPdfMoney(qepik: number): string {
  return `${(qepik / 100).toLocaleString("az-AZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} AZN`;
}

function formatPdfDate(d: Date): string {
  return new Date(d).toLocaleDateString("az-AZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function createDoc(): { doc: Doc; done: Promise<Buffer> } {
  // font в конструкторе = дефолтный Helvetica (.afm) не загружается вовсе
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, font: FONT });
  doc.registerFont("base", FONT);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("base").fontSize(10).fillColor(TEXT);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

/** Перенос страницы, если до низа осталось меньше need pt. */
function ensureSpace(doc: Doc, need: number) {
  if (doc.y + need > doc.page.height - MARGIN - 40) doc.addPage();
}

interface HeaderInfo {
  clinicName: string;
  clinicPhone?: string | null;
  clinicAddress?: string | null;
  title: string;
  docNumber: string;
  createdAt: Date;
}

function drawHeader(doc: Doc, h: HeaderInfo) {
  doc.font("bold").fontSize(16).fillColor(ACCENT).text(h.clinicName, MARGIN, MARGIN);
  const contact = [h.clinicPhone, h.clinicAddress].filter(Boolean).join(" · ");
  if (contact) doc.font("base").fontSize(9).fillColor(MUTED).text(contact);
  doc.moveDown(0.4);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .strokeColor(ACCENT)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.8);
  doc.font("bold").fontSize(14).fillColor(TEXT).text(h.title);
  doc
    .font("base")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`№ ${h.docNumber} · ${formatPdfDate(h.createdAt)}`);
  doc.moveDown(0.8);
}

function drawFooter(doc: Doc, clinicPhone?: string | null) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN - 20;
    doc
      .moveTo(MARGIN, y - 6)
      .lineTo(PAGE_WIDTH - MARGIN, y - 6)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
    const left = clinicPhone ? `Əlaqə: ${clinicPhone}` : "";
    doc
      .font("base")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${left}${left ? "  ·  " : ""}Bu sənəd Dental Pro CRM sistemi vasitəsilə yaradılıb · ${formatPdfDate(new Date())}`,
        MARGIN, y, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
  }
}

function sectionTitle(doc: Doc, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.font("bold").fontSize(11).fillColor(ACCENT).text(title);
  doc.moveDown(0.3);
}

function infoRow(doc: Doc, label: string, value: string) {
  ensureSpace(doc, 16);
  const y = doc.y;
  doc.font("base").fontSize(9.5).fillColor(MUTED).text(label, MARGIN, y, { width: 150 });
  doc.font("base").fontSize(9.5).fillColor(TEXT).text(value, MARGIN + 155, y, {
    width: CONTENT_WIDTH - 155,
  });
  doc.moveDown(0.15);
}

interface Col {
  label: string;
  width: number; // доля CONTENT_WIDTH
  align?: "left" | "right";
}

function tableHeader(doc: Doc, cols: Col[]) {
  ensureSpace(doc, 30);
  const y = doc.y;
  let x = MARGIN;
  doc.font("bold").fontSize(8.5).fillColor(MUTED);
  for (const c of cols) {
    const w = c.width * CONTENT_WIDTH;
    doc.text(c.label.toUpperCase(), x, y, { width: w - 6, align: c.align ?? "left" });
    x += w;
  }
  doc.y = y + 14;
  doc
    .moveTo(MARGIN, doc.y - 3)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y - 3)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
}

function tableRow(doc: Doc, cols: Col[], values: string[]) {
  ensureSpace(doc, 26);
  const y = doc.y;
  let x = MARGIN;
  let maxH = 0;
  doc.font("base").fontSize(9).fillColor(TEXT);
  cols.forEach((c, i) => {
    const w = c.width * CONTENT_WIDTH;
    const h = doc.heightOfString(values[i] ?? "—", { width: w - 6 });
    doc.text(values[i] ?? "—", x, y, { width: w - 6, align: c.align ?? "left" });
    maxH = Math.max(maxH, h);
    x += w;
  });
  doc.y = y + maxH + 6;
}

// ─────────────────── Müalicə çıxarışı ───────────────────

export interface TreatmentSummaryData {
  docNumber: string;
  createdAt: Date;
  clinic: { name: string; phone?: string | null; address?: string | null };
  patient: {
    fullName: string;
    phone?: string | null;
    birthDate?: Date | null;
    age?: number | null;
    genderLabel?: string | null;
    allergies?: string | null;
    guardian?: { fullName: string; phone?: string | null } | null;
    doctorName?: string | null;
  };
  items: Array<{
    performedAt?: Date | null;
    tooth?: number | null;
    service: string;
    statusLabel: string;
    doctorName: string;
    notes?: string | null;
    price?: number | null;
  }>;
  teeth: Array<{ number: number; statusLabel: string; lastTreatedAt?: Date | null }>;
  recommendations: string;
}

export async function renderTreatmentSummaryPdf(data: TreatmentSummaryData): Promise<Buffer> {
  const { doc, done } = createDoc();
  drawHeader(doc, {
    clinicName: data.clinic.name,
    clinicPhone: data.clinic.phone,
    clinicAddress: data.clinic.address,
    title: "Müalicə çıxarışı",
    docNumber: data.docNumber,
    createdAt: data.createdAt,
  });

  sectionTitle(doc, "Pasiyent");
  infoRow(doc, "Ad, soyad", data.patient.fullName);
  if (data.patient.phone) infoRow(doc, "Telefon", data.patient.phone);
  if (data.patient.birthDate) {
    infoRow(doc, "Doğum tarixi",
      `${formatPdfDate(data.patient.birthDate)}${data.patient.age !== null && data.patient.age !== undefined ? ` (${data.patient.age} yaş)` : ""}`);
  }
  if (data.patient.genderLabel) infoRow(doc, "Cins", data.patient.genderLabel);
  if (data.patient.doctorName) infoRow(doc, "Həkim", data.patient.doctorName);
  if (data.patient.allergies) {
    const y = doc.y;
    doc.font("bold").fontSize(9.5).fillColor("#B45309").text("Allergiya", MARGIN, y, { width: 150 });
    doc.font("bold").fontSize(9.5).fillColor("#B45309").text(data.patient.allergies, MARGIN + 155, y, {
      width: CONTENT_WIDTH - 155,
    });
    doc.moveDown(0.15);
  }
  if (data.patient.guardian) {
    infoRow(doc, "Himayəçi",
      `${data.patient.guardian.fullName}${data.patient.guardian.phone ? ` · ${data.patient.guardian.phone}` : ""}`);
  }

  sectionTitle(doc, "Aparılmış müalicələr");
  if (data.items.length === 0) {
    doc.font("base").fontSize(9).fillColor(MUTED).text("Müalicə qeydi yoxdur.", MARGIN, doc.y);
  } else {
    const cols: Col[] = [
      { label: "Tarix", width: 0.13 },
      { label: "Diş", width: 0.07 },
      { label: "Prosedur", width: 0.3 },
      { label: "Status", width: 0.14 },
      { label: "Həkim", width: 0.21 },
      { label: "Qiymət", width: 0.15, align: "right" },
    ];
    tableHeader(doc, cols);
    for (const it of data.items) {
      tableRow(doc, cols, [
        it.performedAt ? formatPdfDate(it.performedAt) : "—",
        it.tooth ? String(it.tooth) : "—",
        `${it.service}${it.notes ? `\n${it.notes}` : ""}`,
        it.statusLabel,
        it.doctorName,
        it.price !== null && it.price !== undefined ? formatPdfMoney(it.price) : "—",
      ]);
    }
  }

  if (data.teeth.length > 0) {
    sectionTitle(doc, "Diş xəritəsi (aktiv statuslar)");
    const cols: Col[] = [
      { label: "Diş", width: 0.12 },
      { label: "Status", width: 0.48 },
      { label: "Son müalicə", width: 0.4 },
    ];
    tableHeader(doc, cols);
    for (const t of data.teeth) {
      tableRow(doc, cols, [
        String(t.number),
        t.statusLabel,
        t.lastTreatedAt ? formatPdfDate(t.lastTreatedAt) : "—",
      ]);
    }
  }

  sectionTitle(doc, "Tövsiyələr");
  ensureSpace(doc, 40);
  doc.font("base").fontSize(9.5).fillColor(TEXT).text(data.recommendations, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });

  drawFooter(doc, data.clinic.phone);
  doc.end();
  return done;
}

// ─────────────────── Hesab sənədi ───────────────────

export interface InvoicePdfData {
  docNumber: string;
  createdAt: Date;
  clinic: { name: string; phone?: string | null; address?: string | null };
  invoice: { number: string; issuedAt: Date; statusLabel: string };
  patient: { fullName: string; phone?: string | null };
  items: Array<{ description: string; qty: number; unitPrice: number; total: number }>;
  totals: { subtotal: number; discount: number; total: number; paid: number; balance: number };
  payments: Array<{ paidAt: Date; methodLabel: string; amount: number; receivedBy: string }>;
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { doc, done } = createDoc();
  drawHeader(doc, {
    clinicName: data.clinic.name,
    clinicPhone: data.clinic.phone,
    clinicAddress: data.clinic.address,
    title: "Hesab sənədi",
    docNumber: data.docNumber,
    createdAt: data.createdAt,
  });

  infoRow(doc, "Hesab №", data.invoice.number);
  infoRow(doc, "Hesab tarixi", formatPdfDate(data.invoice.issuedAt));
  infoRow(doc, "Status", data.invoice.statusLabel);

  sectionTitle(doc, "Pasiyent");
  infoRow(doc, "Ad, soyad", data.patient.fullName);
  if (data.patient.phone) infoRow(doc, "Telefon", data.patient.phone);

  sectionTitle(doc, "Xidmətlər");
  const cols: Col[] = [
    { label: "Xidmət", width: 0.5 },
    { label: "Say", width: 0.1, align: "right" },
    { label: "Qiymət", width: 0.2, align: "right" },
    { label: "Cəm", width: 0.2, align: "right" },
  ];
  tableHeader(doc, cols);
  for (const it of data.items) {
    tableRow(doc, cols, [
      it.description,
      String(it.qty),
      formatPdfMoney(it.unitPrice),
      formatPdfMoney(it.total),
    ]);
  }

  // итоги — правым блоком
  doc.moveDown(0.5);
  const totals: Array<[string, string, boolean]> = [
    ["Cəm", formatPdfMoney(data.totals.subtotal), false],
    ...(data.totals.discount > 0
      ? ([["Endirim", `−${formatPdfMoney(data.totals.discount)}`, false]] as Array<[string, string, boolean]>)
      : []),
    ["Yekun", formatPdfMoney(data.totals.total), true],
    ["Ödənilib", formatPdfMoney(data.totals.paid), false],
    ["Qalıq", formatPdfMoney(data.totals.balance), true],
  ];
  for (const [label, value, strong] of totals) {
    ensureSpace(doc, 16);
    const y = doc.y;
    doc.font(strong ? "bold" : "base").fontSize(9.5).fillColor(strong ? TEXT : MUTED)
      .text(label, MARGIN + CONTENT_WIDTH * 0.5, y, { width: CONTENT_WIDTH * 0.25, align: "right" });
    doc.font(strong ? "bold" : "base").fontSize(9.5).fillColor(TEXT)
      .text(value, MARGIN + CONTENT_WIDTH * 0.75, y, { width: CONTENT_WIDTH * 0.25, align: "right" });
    doc.moveDown(0.15);
  }

  if (data.payments.length > 0) {
    sectionTitle(doc, "Ödənişlər");
    const pcols: Col[] = [
      { label: "Tarix", width: 0.2 },
      { label: "Üsul", width: 0.25 },
      { label: "Qəbul etdi", width: 0.35 },
      { label: "Məbləğ", width: 0.2, align: "right" },
    ];
    tableHeader(doc, pcols);
    for (const p of data.payments) {
      tableRow(doc, pcols, [
        formatPdfDate(p.paidAt),
        p.methodLabel,
        p.receivedBy,
        formatPdfMoney(p.amount),
      ]);
    }
  }

  doc.moveDown(0.8);
  ensureSpace(doc, 20);
  doc.font("base").fontSize(8.5).fillColor(MUTED)
    .text("Ödəniş statusu sistem məlumatlarına əsasən göstərilmişdir.", MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });

  drawFooter(doc, data.clinic.phone);
  doc.end();
  return done;
}
