/**
 * Storage-абстракция (сессия 91). Драйвер выбирается через STORAGE_DRIVER:
 *   - "local" (по умолчанию) — локальный диск uploads/, как было в v1.
 *     Подходит для self-hosted/VPS и для dev/e2e — НИЧЕГО не меняется.
 *   - "s3" — S3-совместимое object storage (Cloudflare R2 / AWS S3 / MinIO)
 *     через @aws-sdk/client-s3. Нужен на serverless (Vercel) — локальный
 *     диск там эфемерен/недоступен на запись (см. docs/DOCUMENTS.md,
 *     найдено эмпирически в сессии 89).
 *
 * Публичные функции (saveUploadFile/readUploadFile/resolveUploadPath)
 * сохранены БЕЗ ИЗМЕНЕНИЯ сигнатур — весь существующий код (lib/actions/*,
 * app/api/*-logo|avatar|signature/*, lib/pdfSignature.ts) продолжает
 * работать без правок. Добавлены deleteUploadFile/existsUploadFile —
 * раньше в этом модуле их не было (scripts/cleanup-deleted-documents.ts
 * держал собственную копию resolveUploadPath именно из-за их отсутствия).
 *
 * Во всех путях (БД-поля Clinic.logoUrl/User.avatarUrl/Doctor.signatureUrl/
 * Document.fileUrl/PdfRecord.fileUrl) ключ — ОДНА И ТА ЖЕ relative-path-
 * подобная строка вида "{feature}/{clinicId}/.../{filename}" — она же
 * становится S3 object key БЕЗ каких-либо преобразований и БЕЗ миграции БД.
 *
 * Безопасность (не зависит от драйвера):
 *  - содержимое НИКОГДА не доверяется по client-supplied mime/расширению —
 *    это валидируется ВЫШЕ этого модуля (sniffUploadMime в вызывающем коде);
 *  - raw-ключ/путь никогда не передаётся клиентским компонентам — только
 *    через уже существующие авторизованные API-routes (без изменений);
 *  - S3-объекты НЕ становятся публично читаемыми — бакет должен быть
 *    приватным, доступ — только через эти серверные вызовы с учётными
 *    данными (никаких presigned/public URL клиенту).
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

/**
 * Безопасное разрешение relative key в абсолютный путь ВНУТРИ uploads/
 * (используется только local-драйвером — для s3 "путь" не существует,
 * там просто object key). null = path traversal / absolute path.
 */
export function resolveUploadPath(relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const resolved = path.resolve(UPLOADS_ROOT, relPath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return resolved;
}

/** true, если в строке есть управляющий символ (код < 0x20) или DEL (0x7f). */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Базовая защита object key — общая для обоих драйверов. У S3 нет понятия
 * "выйти за пределы корня" в файловой системе, но `..`/absolute-подобные/
 * управляющие символы в ключе всё равно отклоняем как defense-in-depth
 * (а для local-драйвера это и есть единственная защита от traversal).
 */
function isSafeKey(key: string): boolean {
  if (!key) return false;
  if (path.isAbsolute(key)) return false;
  if (key.split(/[\\/]/).includes("..")) return false;
  if (hasControlChar(key)) return false;
  return true;
}

interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  async put(key: string, data: Buffer): Promise<void> {
    const abs = resolveUploadPath(key);
    if (!abs) throw new Error(`Unsafe upload path: ${key}`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async get(key: string): Promise<Buffer | null> {
    const abs = resolveUploadPath(key);
    if (!abs) return null;
    try {
      return await fs.readFile(abs);
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    const abs = resolveUploadPath(key);
    if (!abs) return false;
    try {
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const abs = resolveUploadPath(key);
    if (!abs) return;
    await fs.rm(abs, { force: true });
  }
}

interface S3EnvConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Валидация env для s3-драйвера. Бросает понятную ошибку с ИМЕНАМИ
 * отсутствующих переменных (никогда — значениями/секретами). S3_ENDPOINT
 * формально не обязателен (для настоящего AWS S3 SDK сам резолвит
 * стандартный endpoint по region) — но практически нужен для R2/MinIO,
 * см. .env.example/FREE_DEMO_DEPLOY.md.
 */
function getS3EnvConfig(): S3EnvConfig {
  const required = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 требует переменные окружения: ${missing.join(", ")} ` +
        `(см. .env.example). Значения не выводятся в лог — только имена.`,
    );
  }
  return {
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION!,
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const config = getS3EnvConfig();
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    if (!isSafeKey(key)) throw new Error(`Unsafe object key: ${key}`);
    // ContentType сознательно не передаём: приложение никогда не доверяет
    // сохранённому mime — на чтении он всегда пересниффается по байтам
    // (sniffUploadMime), та же дисциплина, что у local-драйвера v1.
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    if (!isSafeKey(key)) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      // NoSuchKey / любая ошибка чтения → null (как и local-драйвер):
      // "файл недоступен" — это не повод 500'ить вызывающий route.
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!isSafeKey(key)) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isSafeKey(key)) return;
    // DeleteObject идемпотентен (как fs.rm force) — не бросает, если ключа нет.
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => {});
  }
}

let driver: StorageDriver | null = null;

/**
 * Ленивая инициализация: ошибка валидации env для s3-драйвера всплывает
 * только при первой реальной попытке записи/чтения, а не при импорте
 * модуля — не ломает код, который просто импортирует lib/storage.ts.
 */
function getDriver(): StorageDriver {
  if (driver) return driver;
  const driverName = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
  driver = driverName === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}

/** Сохранить файл по relative key (создаёт каталоги для local-драйвера). */
export async function saveUploadFile(relPath: string, data: Buffer): Promise<void> {
  await getDriver().put(relPath, data);
}

/** Прочитать файл; null = файл отсутствует или путь/ключ небезопасен. */
export async function readUploadFile(relPath: string): Promise<Buffer | null> {
  return getDriver().get(relPath);
}

/** Существует ли файл — без чтения байт (дешевле readUploadFile для проверки). */
export async function existsUploadFile(relPath: string): Promise<boolean> {
  return getDriver().exists(relPath);
}

/** Удалить файл (идемпотентно — не ошибка, если уже отсутствует). */
export async function deleteUploadFile(relPath: string): Promise<void> {
  await getDriver().delete(relPath);
}
