/**
 * Проверка PDF font bundling fix (сессия 97):
 *   npx tsx scripts/e2e-pdf-font-bundling-check.ts
 * Чисто статическая + build-artifact проверка — НЕ требует dev-сервера/БД.
 * Бизнес-логика самой генерации PDF (текст, AZ-символы, встроенные
 * изображения) уже покрыта e2e-documents-check.ts/e2e-doctor-signature-
 * pdf-check.ts; здесь проверяется именно причина ENOENT на Vercel: что
 * шрифты закоммичены в assets/fonts/ (а не читаются из node_modules) и что
 * сборка (`npm run build`) реально трассирует их в .nft.json для обоих
 * маршрутов, вызывающих lib/pdf.ts (/patients/[id]/documents,
 * /finance/invoices/[id]) — именно это Vercel использует, чтобы решить,
 * какие файлы попадут в бандл serverless-функции. Если `.next` отсутствует
 * (сборка не запускалась) — секция 2 пропускается с пометкой, не падает.
 */
import fs from "node:fs/promises";
import path from "node:path";

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

const FONTS_DIR = path.join(process.cwd(), "assets/fonts");
const ROUTES_USING_PDF = [
  ".next/server/app/(dashboard)/patients/[id]/documents/page.js.nft.json",
  ".next/server/app/(dashboard)/finance/invoices/[id]/page.js.nft.json",
];

async function main() {
  console.log("E2E PDF font bundling check\n");

  console.log("== 1. Закоммиченные шрифты (assets/fonts/) ==");
  for (const name of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
    const p = path.join(FONTS_DIR, name);
    const stat = await fs.stat(p).catch(() => null);
    check(`${name} существует`, !!stat);
    check(`${name} нетривиального размера (>100 KB)`, !!stat && stat.size > 100 * 1024, stat ? `${stat.size} bytes` : "");
  }

  const pdfSource = await fs.readFile(path.join(process.cwd(), "lib/pdf.ts"), "utf8");
  // ищем именно активные строки const FONT/FONT_BOLD = path.join(...), не
  // упоминание старого пути в комментариях — иначе пояснительный комментарий
  // о причине фикса ложно триггерит "регрессию".
  const fontConstLines = pdfSource
    .split("\n")
    .filter((l) => /^const FONT(_BOLD)? = path\.join\(/.test(l.trim()));
  check("lib/pdf.ts: найдены строки const FONT/FONT_BOLD = path.join(...)", fontConstLines.length === 2);
  check(
    "lib/pdf.ts: FONT больше НЕ резолвится из node_modules/dejavu-fonts-ttf (регрессия)",
    fontConstLines.every((l) => !l.includes("node_modules/dejavu-fonts-ttf")),
  );
  check(
    "lib/pdf.ts: FONT резолвится из assets/fonts/",
    fontConstLines.some((l) => l.includes("assets/fonts/DejaVuSans.ttf")),
  );

  const nextConfigSource = await fs.readFile(path.join(process.cwd(), "next.config.ts"), "utf8");
  check(
    "next.config.ts объявляет outputFileTracingIncludes для assets/fonts/",
    nextConfigSource.includes("outputFileTracingIncludes") && nextConfigSource.includes("assets/fonts"),
  );

  console.log("\n== 2. Build-artifact: трассировка в .nft.json (корень причины ENOENT на Vercel) ==");
  const nextDirExists = !!(await fs.stat(path.join(process.cwd(), ".next")).catch(() => null));
  if (!nextDirExists) {
    console.log("  (пропущено: .next отсутствует — запустить после `npm run build`)");
  } else {
    for (const rel of ROUTES_USING_PDF) {
      const p = path.join(process.cwd(), rel);
      const content = await fs.readFile(p, "utf8").catch(() => null);
      check(`${rel}: файл трассировки существует`, !!content);
      if (content) {
        // имя файла одинаково внутри пути независимо от разделителя ('\\' на
        // Windows-сборке / '/' на POSIX) — достаточно искать сам filename.
        check(`${rel}: DejaVuSans.ttf попал в трассировку (Vercel включит в бандл)`, content.includes("DejaVuSans.ttf"));
      }
    }
  }

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
