/**
 * E2E release-candidate sanity check (сессия 53, dev-скрипт):
 *   npx tsx scripts/e2e-release-candidate-check.ts
 * Лёгкая проверка перед RC: критические package scripts/docs на месте,
 * repo hygiene (.env/.pglocal/.next/node_modules/uploads не затрекены),
 * demo-login + ключевые страницы открываются, /api/health/db и
 * /r/[token] (bad token) отдают безопасную форму ответа. Не дублирует
 * scripts/e2e-production-hardening-check.ts — пересекающиеся проверки
 * (repo hygiene, token-страница) оставлены минимальными.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
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

class Session {
  cookies = new Map<string, string>();
  private store(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value || c.toLowerCase().includes("max-age=0")) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  private header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async get(path: string) {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  async postForm(path: string, pageHtml: string, fields: Record<string, string>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const res = await fetch(BASE + path, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), origin: BASE },
      body: fd,
    });
    this.store(res);
    return { status: res.status, location: res.headers.get("location") ?? undefined };
  }
  async login(email: string) {
    const page = await this.get("/login");
    await this.postForm("/login", page.html, { email, password: PASSWORD });
    return this.cookies.has("dp_session");
  }
}

async function main() {
  console.log(`E2E release-candidate check → ${BASE}\n`);

  // A — критические package scripts зарегистрированы
  console.log("A — package scripts");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const requiredScripts = [
    "dev",
    "build",
    "start",
    "db:seed",
    "e2e-demo-flow-check",
    "e2e-production-hardening-check",
    "e2e-mobile-ux-check",
    "e2e-admin-check",
    "e2e-platform-admin-check",
    "e2e-notifications-check",
    "e2e-communications-check",
    "e2e-finance-check",
    "e2e-inventory-check",
    "e2e-release-candidate-check",
  ];
  for (const name of requiredScripts) {
    check(`package script "${name}" зарегистрирован`, typeof pkg.scripts?.[name] === "string");
  }

  // B — критические docs на месте
  console.log("\nB — критические docs");
  const requiredDocs = [
    "docs/SESSION_HANDOFF.md",
    "docs/DEMO.md",
    "docs/DEMO_PRESENTATION.md",
    "docs/PRODUCTION_HARDENING.md",
    "docs/DEPLOYMENT.md",
    "docs/SETUP.md",
    "docs/RELEASE_CANDIDATE_CHECKLIST.md",
  ];
  for (const rel of requiredDocs) {
    check(`${rel} существует`, fs.existsSync(path.join(ROOT, rel)));
  }

  // C — repo hygiene (до сети, не требует dev-сервера)
  console.log("\nC — repo hygiene");
  {
    const tracked = execSync("git ls-files", { cwd: ROOT }).toString();
    const forbidden = [/^\.env$/m, /^\.pglocal\//m, /^\.next\//m, /^node_modules\//m, /^uploads\//m];
    const leaked = forbidden.filter((re) => re.test(tracked));
    check("git: .env/.pglocal/.next/node_modules/uploads не затрекены", leaked.length === 0, JSON.stringify(leaked));
  }

  // D — demo-login + ключевые страницы
  console.log("\nD — demo-login və əsas səhifələr");
  const loginPage = await fetch(BASE + "/login");
  check("/login açılır (200)", loginPage.status === 200);

  const owner = new Session();
  check("demo-login işləyir (admin@demo.dentalpro.az)", await owner.login("admin@demo.dentalpro.az"));

  const criticalPages: Array<[string, string]> = [
    ["/dashboard", "Dashboard"],
    ["/patients", "Pasiyentlər"],
    ["/finance", "Maliyyə"],
  ];
  for (const [p, marker] of criticalPages) {
    const res = await owner.get(p);
    check(`${p} açılır`, res.status === 200 && res.html.includes(marker));
  }

  // E — /api/health/db təhlükəsiz formada cavab verir
  console.log("\nE — health/db");
  {
    const res = await fetch(BASE + "/api/health/db");
    const body = await res.json().catch(() => null);
    const safeShape =
      (res.status === 200 || res.status === 503) &&
      !!body &&
      typeof body.ok === "boolean" &&
      typeof body.db === "string";
    check("/api/health/db təhlükəsiz formada cavab verir (ok:boolean, db:string)", safeShape, JSON.stringify(body));
  }

  // F — /r/bad-token: ümumi təhlükəsiz vəziyyət, sızma yoxdur
  console.log("\nF — /r/[token] bad token");
  {
    const res = await fetch(BASE + "/r/bad-token");
    const html = await res.text();
    const safeGeneric =
      res.status === 200 &&
      html.includes('data-e2e-marker="link-expired"') &&
      !html.includes("Həsənov") &&
      !html.includes("Quliyeva");
    check("/r/bad-token ümumi təhlükəsiz səhifə göstərir (sızma yoxdur)", safeGeneric);
  }

  console.log(`\nNəticə: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
