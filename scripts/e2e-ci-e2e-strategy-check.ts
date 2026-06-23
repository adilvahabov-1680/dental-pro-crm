/**
 * Static CI/E2E strategy check (сессия 56, дополнен в сессии 58, dev-скрипт):
 *   npx tsx scripts/e2e-ci-e2e-strategy-check.ts
 * Чисто статическая проверка (НЕ требует dev-сервера/БД): docs/CI_E2E_STRATEGY.md
 * на месте, e2e-smoke.yml (если есть) — manual-only triggers, использует
 * Postgres service container, реальные `prisma migrate deploy` (не `db push`),
 * не содержит секретов/production-DB URL, только dummy env, запускает
 * ограниченный (не полный 40-скриптовый) набор e2e, и эти scripts реально
 * зарегистрированы в package.json.
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
  console.log("E2E ci-e2e-strategy check (static, no dev server/DB needed)\n");

  // A — docs/CI_E2E_STRATEGY.md существует
  console.log("A — docs");
  const docPath = "docs/CI_E2E_STRATEGY.md";
  const docExists = fs.existsSync(path.join(ROOT, docPath));
  check(`${docPath} существует`, docExists);

  const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

  // B — e2e-smoke.yml (если добавлен): manual-only + postgres service + safe env
  console.log("\nB — e2e-smoke.yml (если добавлен)");
  const workflowPath = ".github/workflows/e2e-smoke.yml";
  const workflowExists = fs.existsSync(path.join(ROOT, workflowPath));
  check(`${workflowPath} существует (опционально)`, workflowExists);

  if (workflowExists) {
    const wf = read(workflowPath);

    check("workflow использует workflow_dispatch", /workflow_dispatch/.test(wf));
    check(
      "workflow НЕ триггерится на push/pull_request (manual-first)",
      !/^on:\s*\n\s*push:/m.test(wf) && !/^\s*push:\s*$/m.test(wf.split("workflow_dispatch")[0] ?? ""),
    );
    check("workflow использует Postgres service container", /services:[\s\S]*postgres:/.test(wf));
    check("workflow использует «prisma migrate deploy» (не db push)", /prisma migrate deploy/.test(wf));
    check("workflow НЕ использует «prisma db push» (миграции, не push)", !/prisma db push/.test(wf));

    // Секреты/production-подобные паттерны — НЕ должны встречаться.
    const secretPatterns: Array<[string, RegExp]> = [
      ["GitHub PAT (ghp_/github_pat_)", /\b(ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
      ["AWS access key (AKIA...)", /\bAKIA[0-9A-Z]{16}\b/],
      ["generic private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ["Slack token (xox...)", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
      ["${{ secrets. }} usage", /\$\{\{\s*secrets\./],
      ["neon.tech / production-подобный host", /neon\.tech|amazonaws\.com|\.rds\./],
    ];
    for (const [label, re] of secretPatterns) {
      check(`workflow: нет "${label}"`, !re.test(wf));
    }

    // Dummy/safe env-маркеры — должны присутствовать.
    check("workflow: DATABASE_URL — явно localhost/ci-значение", /localhost:5432/.test(wf));
    check("workflow: SESSION_SECRET — явно dummy-значение", /dummy/i.test(wf));
    check("workflow: SEED_DEMO_PASSWORD задан явно", /SEED_DEMO_PASSWORD/.test(wf));

    // Ограниченный smoke-набор — НЕ полный 40-скриптовый матрикс.
    const e2eRunLines = wf.match(/npm run e2e-[a-z0-9-]+/g) ?? [];
    const uniqueE2eScripts = [...new Set(e2eRunLines.map((l) => l.replace("npm run ", "")))];
    check(
      "workflow запускает ограниченный (не полный 40-скриптовый) e2e-набор",
      uniqueE2eScripts.length > 0 && uniqueE2eScripts.length <= 10,
      `найдено: ${uniqueE2eScripts.length}`,
    );
    for (const scriptName of uniqueE2eScripts) {
      check(`package script "${scriptName}" (используется в workflow) зарегистрирован`, typeof pkg.scripts?.[scriptName] === "string");
    }
  }

  // C — package script для самого этого check зарегистрирован
  console.log("\nC — package scripts");
  check(
    'package script "e2e-ci-e2e-strategy-check" зарегистрирован',
    typeof pkg.scripts?.["e2e-ci-e2e-strategy-check"] === "string",
  );

  // D — ключевые docs ссылаются на CI_E2E_STRATEGY
  console.log("\nD — docs cross-link to CI_E2E_STRATEGY");
  const docsToCheck = ["docs/EXTERNAL_AUDIT.md", "docs/RELEASE_CANDIDATE_CHECKLIST.md", "docs/SESSION_HANDOFF.md"];
  for (const rel of docsToCheck) {
    const content = fs.existsSync(path.join(ROOT, rel)) ? read(rel) : "";
    check(`${rel} ссылается на CI_E2E_STRATEGY`, content.includes("CI_E2E_STRATEGY"));
  }

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
