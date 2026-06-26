/**
 * Очистка физических файлов для soft-deleted записей `documents` (сессия 19,
 * обновлено сессия 91 — storage-абстракция вместо собственной копии
 * resolveUploadPath; работает одинаково для local- и s3-драйвера, см.
 * lib/storage.ts).
 *
 *   npx tsx scripts/cleanup-deleted-documents.ts          # dry-run (по умолчанию)
 *   npx tsx scripts/cleanup-deleted-documents.ts --execute  # реально удалить файлы
 *
 * Затрагивает ТОЛЬКО таблицу `documents` (загруженные файлы пациентов),
 * НЕ `pdf_records` (сгенерированные PDF не трогаем).
 * Сами записи `documents` из БД не удаляются — только их физические файлы/
 * объекты (поле `fileUrl` обнуляется в db не предусмотрено в v1, поэтому
 * запись остаётся, но повторный прогон скрипта просто увидит отсутствующий
 * файл и пропустит её).
 *
 * Без cron-хуков в этой сессии — запуск вручную/по плану из docs.
 */
import { PrismaClient } from "@prisma/client";
import { existsUploadFile, deleteUploadFile } from "@/lib/storage";

const prisma = new PrismaClient();

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

  for (const doc of docs) {
    // existsUploadFile сама отсекает небезопасный путь/ключ (вернёт false) —
    // отдельной проверки traversal здесь не нужно, это забота lib/storage.ts.
    const exists = await existsUploadFile(doc.fileUrl);
    if (!exists) {
      missing++;
      continue;
    }
    if (execute) {
      await deleteUploadFile(doc.fileUrl);
      console.log(`  [удалён] ${doc.fileUrl}`);
    } else {
      console.log(`  [будет удалён] ${doc.fileUrl}`);
    }
    removed++;
  }

  console.log(
    `\nИтог: ${docs.length} soft-deleted документов; ` +
      `${removed} файлов ${execute ? "удалено" : "будет удалено"}; ` +
      `${missing} уже отсутствовали (включая небезопасные/неразрешимые ключи, если такие есть)`,
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
