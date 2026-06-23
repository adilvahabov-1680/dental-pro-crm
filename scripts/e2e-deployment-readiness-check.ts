/**
 * E2E deployment-readiness sanity check (сессия 54, dev-скрипт):
 *   npx tsx scripts/e2e-deployment-readiness-check.ts
 * Лёгкая проверка перед деплоем: deployment/backup/runbook docs на месте,
 * `.env.example` содержит обязательные ключи, ключевые package scripts
 * зарегистрированы, health-эндпоинты отвечают, `/login` открывается,
 * repo hygiene. Не дублирует scripts/e2e-release-candidate-check.ts
 * (demo-login, ключевые страницы под сессией, `/r/bad-token`) — здесь
 * только статические/deployment-специфичные проверки.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
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

async function main() {
  console.log(`E2E deployment-readiness check → ${BASE}\n`);

  // A — критические deployment/backup/runbook docs на месте
  console.log("A — deployment docs");
  const requiredDocs = [
    "docs/DEPLOYMENT.md",
    "docs/DEPLOYMENT_RUNBOOK.md",
    "docs/BACKUP_MONITORING.md",
    "docs/PRODUCTION_HARDENING.md",
    "docs/RELEASE_CANDIDATE_CHECKLIST.md",
    "docs/FREE_DEMO_DEPLOY.md",
    "docs/SESSION_HANDOFF.md",
  ];
  for (const rel of requiredDocs) {
    check(`${rel} существует`, fs.existsSync(path.join(ROOT, rel)));
  }

  // B — .env.example содержит обязательные ключи
  console.log("\nB — .env.example obligatory keys");
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const requiredEnvKeys = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "AUTH_MOCK",
    "NEXT_PUBLIC_DEMO_MODE",
    "SEED_DEMO_PASSWORD",
  ];
  for (const key of requiredEnvKeys) {
    check(`.env.example содержит "${key}"`, new RegExp(`^#?\\s*${key}=`, "m").test(envExample));
  }

  // C — критические package scripts зарегистрированы
  console.log("\nC — package scripts");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const requiredScripts = [
    "build",
    "start",
    "db:seed",
    "prod:migrate",
    "prod:update",
    "e2e-release-candidate-check",
    "e2e-production-hardening-check",
    "e2e-deployment-readiness-check",
  ];
  for (const name of requiredScripts) {
    check(`package script "${name}" зарегистрирован`, typeof pkg.scripts?.[name] === "string");
  }

  // D — repo hygiene (до сети, не требует dev-сервера)
  console.log("\nD — repo hygiene");
  {
    const tracked = execSync("git ls-files", { cwd: ROOT }).toString();
    const forbidden = [/^\.env$/m, /^\.pglocal\//m, /^\.next\//m, /^node_modules\//m, /^uploads\//m];
    const leaked = forbidden.filter((re) => re.test(tracked));
    check("git: .env/.pglocal/.next/node_modules/uploads не затрекены", leaked.length === 0, JSON.stringify(leaked));
  }

  // E — health endpoints
  console.log("\nE — health endpoints");
  {
    const res = await fetch(BASE + "/api/health");
    const body = await res.json().catch(() => null);
    check("/api/health → 200 {ok:true, service}", res.status === 200 && body?.ok === true && typeof body?.service === "string");
  }
  {
    const res = await fetch(BASE + "/api/health/db");
    const body = await res.json().catch(() => null);
    const safeShape =
      (res.status === 200 || res.status === 503) && !!body && typeof body.ok === "boolean" && typeof body.db === "string";
    check("/api/health/db → təhlükəsiz forma (ok:boolean, db:string)", safeShape, JSON.stringify(body));
  }

  // F — /login açılır
  console.log("\nF — /login");
  {
    const res = await fetch(BASE + "/login");
    check("/login açılır (200)", res.status === 200);
  }

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
