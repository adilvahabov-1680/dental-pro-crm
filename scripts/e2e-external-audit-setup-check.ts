/**
 * Static external-audit-setup check (сессия 55, dev-скрипт):
 *   npx tsx scripts/e2e-external-audit-setup-check.ts
 * Чисто статическая проверка (НЕ требует dev-сервера/БД): CodeQL/CI workflow
 * на месте, docs/EXTERNAL_AUDIT.md существует и на него ссылаются ключевые
 * docs, package scripts зарегистрированы, package.json валиден, в workflow-
 * файлах нет секретов/реальных токенов/паролей — только dummy-значения.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

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

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  console.log("E2E external-audit-setup check (static, no dev server/DB needed)\n");

  // A — критические файлы на месте
  console.log("A — files exist");
  const requiredFiles = [
    "docs/EXTERNAL_AUDIT.md",
    ".github/workflows/codeql.yml",
    ".github/workflows/ci.yml",
  ];
  for (const rel of requiredFiles) {
    check(`${rel} существует`, fs.existsSync(path.join(ROOT, rel)));
  }

  // B — package scripts зарегистрированы
  console.log("\nB — package scripts");
  const pkgRaw = read("package.json");
  let pkg: { scripts?: Record<string, string> } | null = null;
  try {
    pkg = JSON.parse(pkgRaw);
    check("package.json — валидный JSON", true);
  } catch (e) {
    check("package.json — валидный JSON", false, String(e));
  }
  const requiredScripts = ["audit:deps", "e2e-external-audit-setup-check"];
  for (const name of requiredScripts) {
    check(`package script "${name}" зарегистрирован`, typeof pkg?.scripts?.[name] === "string");
  }

  // C — ключевые docs ссылаются на EXTERNAL_AUDIT.md
  console.log("\nC — docs cross-link to EXTERNAL_AUDIT");
  const docsToCheck = [
    "docs/PRODUCTION_HARDENING.md",
    "docs/RELEASE_CANDIDATE_CHECKLIST.md",
    "docs/SESSION_HANDOFF.md",
  ];
  for (const rel of docsToCheck) {
    const content = fs.existsSync(path.join(ROOT, rel)) ? read(rel) : "";
    check(`${rel} ссылается на EXTERNAL_AUDIT`, content.includes("EXTERNAL_AUDIT"));
  }

  // D — workflow-файлы не содержат секретов/реальных токенов/паролей
  console.log("\nD — workflow files: no secrets/real tokens");
  const workflowFiles = [".github/workflows/codeql.yml", ".github/workflows/ci.yml"];
  // Паттерны реальных секретов (НЕ совпадают с dummy-значениями в наших workflow):
  const secretPatterns: Array<[string, RegExp]> = [
    ["GitHub PAT (ghp_/github_pat_)", /\b(ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
    ["AWS access key (AKIA...)", /\bAKIA[0-9A-Z]{16}\b/],
    ["generic private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["Slack token (xox...)", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
    ["${{ secrets. }} usage", /\$\{\{\s*secrets\./],
  ];
  for (const rel of workflowFiles) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const content = read(rel);
    for (const [label, re] of secretPatterns) {
      check(`${rel}: нет "${label}"`, !re.test(content));
    }
    // dummy-маркеры должны присутствовать в env (если файл их использует) —
    // защита от того, что кто-то тихо заменит dummy на реальный секрет.
    if (content.includes("DATABASE_URL")) {
      check(`${rel}: DATABASE_URL — явно dummy/ci-значение`, /ci_dummy|localhost/.test(content));
    }
    if (content.includes("SESSION_SECRET")) {
      check(`${rel}: SESSION_SECRET — явно dummy-значение`, /dummy/i.test(content));
    }
  }

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
