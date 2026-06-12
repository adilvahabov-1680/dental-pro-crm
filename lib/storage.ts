/**
 * Локальный файловый storage для сгенерированных PDF (v1).
 * Файлы: uploads/documents/{clinicId}/{patientId}/{filename}.pdf;
 * в БД (pdf_records.fileUrl) хранится ТОЛЬКО relative path внутри uploads/.
 *
 * ОГРАНИЧЕНИЕ PRODUCTION (см. docs/DOCUMENTS.md): локальный диск подходит
 * для self-hosted/VPS; на serverless (Vercel/Netlify) файловая система
 * эфемерна — перед таким деплоем storage-слой меняется на S3-совместимый
 * (этот модуль — единственная точка замены).
 */
import fs from "node:fs/promises";
import path from "node:path";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

/**
 * Безопасное разрешение relative path внутри uploads/.
 * null = попытка выйти за пределы корня (path traversal) или absolute path.
 */
export function resolveUploadPath(relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const resolved = path.resolve(UPLOADS_ROOT, relPath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return resolved;
}

/** Сохранить файл по relative path (создаёт каталоги). */
export async function saveUploadFile(relPath: string, data: Buffer): Promise<void> {
  const abs = resolveUploadPath(relPath);
  if (!abs) throw new Error(`Unsafe upload path: ${relPath}`);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

/** Прочитать файл; null = файл отсутствует или путь небезопасен. */
export async function readUploadFile(relPath: string): Promise<Buffer | null> {
  const abs = resolveUploadPath(relPath);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}
