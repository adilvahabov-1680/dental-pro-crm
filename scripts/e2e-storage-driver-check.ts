/**
 * Smoke-проверка storage-driver абстракции (сессия 91):
 *   npx tsx scripts/e2e-storage-driver-check.ts
 * НЕ требует dev-сервера и НЕ требует реальных S3-учётных данных.
 *
 * Проверяет:
 *  1. local-драйвер (дефолтный, текущий процесс) — write/read/exists/delete,
 *     идемпотентность удаления, traversal/absolute путь отклонены.
 *  2. s3-драйвер: понятная ошибка с ИМЕНАМИ отсутствующих env (не значениями)
 *     при STORAGE_DRIVER=s3 без обязательных переменных — полностью и частично.
 *
 * driver внутри lib/storage.ts — module-level singleton (вычисляется один
 * раз на процесс, как и в реальном приложении: STORAGE_DRIVER не меняется
 * на лету). Поэтому сценарий 2 запускается в ОТДЕЛЬНЫХ child-процессах
 * (как и в проде, где env задаётся один раз при старте), а не подменой
 * process.env в этом же процессе после того, как local-драйвер уже
 * инициализирован сценарием 1.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  saveUploadFile,
  readUploadFile,
  existsUploadFile,
  deleteUploadFile,
  resolveUploadPath,
} from "@/lib/storage";

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

const S3_ENV_KEYS = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
] as const;

async function testLocalDriver() {
  console.log("== local driver (дефолт, STORAGE_DRIVER не задан) ==");

  const ts = Date.now();
  const key = `documents/_e2e-storage-driver-test/${ts}/test.txt`;
  const bytes = Buffer.from("storage driver smoke test");

  check("resolveUploadPath: валидный относительный ключ резолвится", !!resolveUploadPath(key));
  check("resolveUploadPath: traversal (../) отклонён", resolveUploadPath("../../etc/passwd") === null);
  check("resolveUploadPath: absolute путь отклонён", resolveUploadPath("/etc/passwd") === null);

  check("existsUploadFile: файла нет до записи", (await existsUploadFile(key)) === false);

  await saveUploadFile(key, bytes);
  check("existsUploadFile: файл появился после saveUploadFile", (await existsUploadFile(key)) === true);

  const read = await readUploadFile(key);
  check("readUploadFile: байты совпадают", !!read && read.equals(bytes));

  const missing = await readUploadFile(`documents/_e2e-storage-driver-test/${ts}/nonexistent.txt`);
  check("readUploadFile: отсутствующий файл → null (без краша)", missing === null);

  await deleteUploadFile(key);
  check("deleteUploadFile: файл удалён", (await existsUploadFile(key)) === false);

  let idempotentOk = true;
  try {
    await deleteUploadFile(key); // повторное удаление не должно бросать
  } catch {
    idempotentOk = false;
  }
  check("deleteUploadFile: повторное удаление идемпотентно (не бросает)", idempotentOk);

  await fs.rm(path.join(process.cwd(), "uploads", "documents", "_e2e-storage-driver-test"), {
    recursive: true,
    force: true,
  });
}

function runS3Child(envOverrides: Record<string, string>): string {
  const env: NodeJS.ProcessEnv = { ...process.env, STORAGE_DRIVER: "s3" };
  for (const k of S3_ENV_KEYS) delete env[k];
  Object.assign(env, envOverrides);

  // Без shell: true — путь проекта содержит пробел ("Claude code"),
  // а execFileSync с shell:true не квотирует аргументы сам. Вызываем
  // node + резолвленный tsx CLI напрямую — аргументы с пробелами
  // передаются ОС-процессу как есть, без ручного квотирования.
  const self = process.argv[1];
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  try {
    const out = execFileSync(process.execPath, [tsxCli, self, "--s3-child"], {
      env,
      encoding: "utf8",
    });
    return out.trim();
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return `EXEC_FAILED:${err.stdout ?? err.message ?? String(e)}`;
  }
}

async function testS3EnvValidation() {
  console.log("\n== s3 driver env validation (отдельные child-процессы, без реальных credentials) ==");

  const noVars = runS3Child({});
  check(
    "s3 driver: без переменных → бросает с именами всех 4 обязательных",
    noVars.includes("S3_BUCKET") &&
      noVars.includes("S3_REGION") &&
      noVars.includes("S3_ACCESS_KEY_ID") &&
      noVars.includes("S3_SECRET_ACCESS_KEY") &&
      noVars.startsWith("CHILD_RESULT:threw:"),
    noVars,
  );
  check("s3 driver: сообщение не требует S3_ENDPOINT (не обязателен)", !noVars.includes("S3_ENDPOINT"));

  const partial = runS3Child({ S3_BUCKET: "test-bucket-not-real" });
  check(
    "s3 driver: частичные переменные → в ошибке нет S3_BUCKET (он задан)",
    partial.startsWith("CHILD_RESULT:threw:") && !partial.includes("S3_BUCKET"),
    partial,
  );
  check(
    "s3 driver: частичные переменные → в ошибке есть оставшиеся 3",
    partial.includes("S3_REGION") && partial.includes("S3_ACCESS_KEY_ID") && partial.includes("S3_SECRET_ACCESS_KEY"),
    partial,
  );
}

async function main() {
  // self-invocation: режим "ребёнка" — попытка put и вывод результата в stdout,
  // без падения родительского процесса (родитель сам решает, ожидался ли throw).
  if (process.argv.includes("--s3-child")) {
    try {
      await saveUploadFile("documents/_e2e-storage-driver-test/child/x.txt", Buffer.from("x"));
      console.log("CHILD_RESULT:no-throw");
    } catch (e) {
      console.log(`CHILD_RESULT:threw:${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }

  console.log("E2E storage driver check\n");

  await testLocalDriver();
  await testS3EnvValidation();

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
