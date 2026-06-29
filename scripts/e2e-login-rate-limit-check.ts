/**
 * E2E-проверка login rate limiting (сессия 104):
 *   npx tsx scripts/e2e-login-rate-limit-check.ts
 * Требует dev-сервер. Не требует seed — создаёт собственного эфемерного
 * тестового пользователя (удаляется в finally).
 *
 * Лимитер in-memory и process-local (lib/login-rate-limit.ts) — живёт в
 * памяти ТОГО ЖЕ процесса, что и dev-сервер, поэтому пороги читает из
 * СВОЕГО env именно dev-сервер, не этот скрипт. Дефолт LOCKOUT в проде —
 * 15 минут — слишком долго для рутинного прогона (WINDOW трогать не
 * нужно: 5 быстрых попыток подряд легко укладываются даже в дефолтные
 * 15 минут окна). Чтобы проверить ПОЛНЫЙ цикл (включая истечение lockout)
 * за разумное время, запустить dev-сервер с коротким lockout:
 *
 *   LOGIN_RATE_LIMIT_LOCKOUT_MS=4000 npm run dev
 *
 * и запустить этот скрипт с ТЕМ ЖЕ значением в своём env (использует его
 * только для расчёта времени ожидания, серверу не передаёт):
 *
 *   LOGIN_RATE_LIMIT_LOCKOUT_MS=4000 npx tsx scripts/e2e-login-rate-limit-check.ts
 *
 * Без переопределения скрипт всё равно проверяет шаги 1-6 (блокировка
 * после порога, generic-сообщение, изоляция между email), но ПРОПУСКАЕТ
 * шаг «после истечения lockout» с понятным предупреждением — ждать
 * реальные 15 минут в рутинном прогоне непрактично.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const E2E_PASS = "E2eTest9999!";
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) || 5;
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60_000;
const LOCKOUT_MS = Number(process.env.LOGIN_RATE_LIMIT_LOCKOUT_MS) || 15 * 60_000;
const THRESHOLDS_OVERRIDDEN = !!process.env.LOGIN_RATE_LIMIT_LOCKOUT_MS;
const prisma = new PrismaClient();

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
  async get(p: string) {
    const res = await fetch(BASE + p, { redirect: "manual", headers: { cookie: this.header() } });
    this.store(res);
    return { status: res.status, html: res.status < 300 ? await res.text() : "" };
  }
  /** POST формы server action; возвращает тело ответа (re-render страницы с новым state). */
  async postForm(p: string, pageHtml: string, fields: Record<string, string>) {
    const un = (s: string) =>
      s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const fd = new FormData();
    for (const tag of [...pageHtml.matchAll(/<input[^>]+type="hidden"[^>]*>/g)].map((m) => m[0])) {
      const name = tag.match(/name="([^"]+)"/)?.[1];
      const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name?.startsWith("$ACTION")) fd.set(un(name), un(value));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const res = await fetch(BASE + p, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), origin: BASE },
      body: fd,
    });
    this.store(res);
    const body = res.status < 400 ? await res.text() : "";
    return { status: res.status, body, loggedIn: this.cookies.has("dp_session") };
  }
}

const INVALID_TEXT = "E-poçt və ya şifrə yanlışdır";
const RATE_LIMITED_TEXT = "Çox sayda uğursuz giriş cəhdi oldu";

/**
 * Реально отрендеренный текст ошибки — ТОЛЬКО из `<p>` с классом ошибки
 * формы, не "содержит ли HTML где-либо эту строку". RSC-стрим кладёт ВСЕ
 * переданные клиентскому компоненту labels (включая error/rateLimited)
 * как сериализованные props в `<script>__next_f.push(...)</script>` ДО
 * реального `<form>` — наивный `body.includes(text)` матчит там обе
 * строки одновременно независимо от того, какая ошибка реально показана
 * (см. конвенцию "E2E-техника" в docs/SESSION_HANDOFF.md).
 */
function renderedErrorText(html: string): string | null {
  const m = html.match(
    /<p class="rounded-\[10px\] border border-danger\/30 bg-danger\/10 px-3 py-2 text-sm text-danger">([^<]*)<\/p>/,
  );
  return m ? m[1] : null;
}

/** Один попытка логина с свежей сессией; возвращает итог: вошёл / какое сообщение показано. */
async function attemptLogin(email: string, password: string) {
  const session = new Session();
  const page = await session.get("/login");
  const res = await session.postForm("/login", page.html, { email, password });
  const errorText = renderedErrorText(res.body);
  return {
    loggedIn: res.loggedIn,
    showsInvalid: errorText === INVALID_TEXT,
    showsRateLimited: !!errorText?.startsWith(RATE_LIMITED_TEXT),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`E2E login rate limit check → ${BASE}`);
  console.log(`  MAX_ATTEMPTS=${MAX_ATTEMPTS} WINDOW_MS=${WINDOW_MS} LOCKOUT_MS=${LOCKOUT_MS}`);
  console.log(`  thresholds overridden via env: ${THRESHOLDS_OVERRIDDEN}\n`);

  const ts = Date.now();
  const ownerRole = await prisma.role.findFirstOrThrow({ where: { clinicId: null, key: "owner" } });
  const clinic = await prisma.clinic.create({
    data: { name: `E2E RateLimit Clinic ${ts}`, slug: `e2e-ratelimit-clinic-${ts}`, status: "active" },
  });
  const passwordHash = await bcrypt.hash(E2E_PASS, 10);
  const email = `e2e-ratelimit-${ts}@test.dentalpro.az`;
  const user = await prisma.user.create({
    data: { clinicId: clinic.id, roleId: ownerRole.id, email, fullName: "E2E RateLimit Owner", passwordHash, locale: "az" },
  });

  // несуществующий email — для проверки изоляции лимитера между email
  const otherEmail = `e2e-ratelimit-other-${ts}@test.dentalpro.az`;

  try {
    // ── 1-4. попытки до порога (по умолчанию 4 из 5) — обычная ошибка ──
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const r = await attemptLogin(email, "wrong-password");
      check(
        `${i}. попытка ${i}/${MAX_ATTEMPTS - 1}: обычная ошибка (без lockout)`,
        !r.loggedIn && r.showsInvalid && !r.showsRateLimited,
      );
    }

    // ── 5. MAX_ATTEMPTS-я попытка — сама ещё обычная ошибка, но включает lockout ──
    const r5 = await attemptLogin(email, "wrong-password");
    check(
      `5. попытка ${MAX_ATTEMPTS}/${MAX_ATTEMPTS}: обычная ошибка (порог достигнут, lockout включается со следующей)`,
      !r5.loggedIn && r5.showsInvalid && !r5.showsRateLimited,
    );

    // ── 6. следующая попытка — уже generic rate-limited, даже с неверным паролем ──
    const r6 = await attemptLogin(email, "wrong-password");
    check(
      "6. попытка после порога: generic rate-limited сообщение",
      !r6.loggedIn && r6.showsRateLimited && !r6.showsInvalid,
    );

    // ── 7. та же блокировка действует даже с ПРАВИЛЬНЫМ паролем ──
    const r7 = await attemptLogin(email, E2E_PASS);
    check(
      "7. правильный пароль во время lockout: всё равно rate-limited, вход не происходит",
      !r7.loggedIn && r7.showsRateLimited,
    );

    // ── 8. другой (несуществующий) email не задет — обычная ошибка, не lockout ──
    const r8 = await attemptLogin(otherEmail, "whatever");
    check(
      "8. другой email не затронут лимитером того email (обычная ошибка)",
      !r8.loggedIn && r8.showsInvalid && !r8.showsRateLimited,
    );

    // ── 9. после истечения lockout — успешный вход правильным паролем, счётчик сброшен ──
    if (THRESHOLDS_OVERRIDDEN) {
      const waitMs = LOCKOUT_MS + 1000;
      console.log(`\n  (ждём ${waitMs}ms истечения lockout...)`);
      await sleep(waitMs);
      const r9 = await attemptLogin(email, E2E_PASS);
      check("9. после истечения lockout: успешный вход правильным паролем", r9.loggedIn);

      // повторная неудачная попытка теперь должна снова дать ПЕРВУЮ обычную
      // ошибку (счётчик сброшен успешным входом, не продолжает старый lockout)
      const r9b = await attemptLogin(email, "wrong-password-again");
      check(
        "9b. после успешного входа счётчик сброшен (новая ошибка не rate-limited)",
        !r9b.loggedIn && r9b.showsInvalid && !r9b.showsRateLimited,
      );
    } else {
      console.log(
        "\n  (пропущено: шаг 9 «после истечения lockout» — LOGIN_RATE_LIMIT_LOCKOUT_MS " +
          "не переопределён, ждать продакшен-дефолт 15 минут непрактично в рутинном " +
          "прогоне; см. комментарий в начале файла)",
      );
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.clinic.deleteMany({ where: { id: clinic.id } });
    console.log("\n  (временные данные e2e удалены)");
  }

  console.log(`\nРезультат: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
