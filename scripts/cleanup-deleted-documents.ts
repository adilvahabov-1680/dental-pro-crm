/**
 * Очистка физических файлов для soft-deleted записей `documents` (сессия 19).
 *
 *   npx tsx scripts/cleanup-deleted-documents.ts          # dry-run (по умолчанию)
 *   npx tsx scripts/cleanup-deleted-documents.ts --execute  # реально удалить файлы
 *
 * Затрагивает ТОЛЬКО таблицу `documents` (загруженные файлы пациентов),
 * НЕ `pdf_records` (сгенерированные PDF не трогаем).
 * Сами записи `documents` из БД не удаляются — только их физические файлы
 * на диске (поле `fileUrl` обнуляется в db не предусмотрено в v1, поэтому
 * запись остаётся, но повторный прогон скрипта просто увидит отсутствующий
 * файл и пропустит её).
 *
 * Без cron-хуков в этой сессии — запуск вручную/по плану из docs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

/** Та же логика, что в lib/storage.ts: null = path traversal / absolute path. */
function resolveUploadPath(relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const resolved = path.resolve(UPLOADS_ROOT, relPath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return resolved;
}

async function main() {
  const execute = process.argv.includes("--execute");
  console.log(`Очистка файлов удалённых документов (${execute ? "EXECUTE" : "dry-run"})\n`);

  const docs = await prisma.document.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, fileUrl: true, title: true, deletedAt: true },
    orderBy: { deletedAt: "asc" },
  });

  let removed = 0;
  let missing = 0;
  let unsafe = 0;

  for (const doc of docs) {
    const abs = resolveUploadPath(doc.fileUrl);
    if (!abs) {
      unsafe++;
      console.log(`  [небезопасный путь, пропуск] ${doc.id} ${doc.fileUrl}`);
      continue;
    }
    const exists = await fs
      .access(abs)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      missing++;
      continue;
    }
    if (execute) {
      await fs.rm(abs, { force: true });
      console.log(`  [удалён] ${doc.fileUrl}`);
    } else {
      console.log(`  [будет удалён] ${doc.fileUrl}`);
    }
    removed++;
  }

  console.log(
    `\nИтог: ${docs.length} soft-deleted документов; ` +
      `${removed} файлов ${execute ? "удалено" : "будет удалено"}; ` +
      `${missing} уже отсутствовали; ${unsafe} с небезопасным путём (пропущены)`,
  );
  if (!execute && removed > 0) {
    console.log("\nЗапустите с --execute, чтобы реально удалить файлы.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
