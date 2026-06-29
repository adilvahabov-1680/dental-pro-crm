/**
 * Login brute-force throttling (сессия 104) — process-local in-memory
 * лимитер, без БД/Redis. Намеренный v1-компромисс: целевая инфраструктура
 * реальной клиники — VPS (один долгоживущий процесс, см. DEPLOYMENT.md),
 * где этот Map переживает между запросами. На serverless (публичный
 * Vercel-demo) лимит слабее — состояние не делится между инстансами и
 * сбрасывается на холодном старте; это принятый tradeoff для v1, не баг
 * (demo-пароль admin123 уже публично документирован для целей показа —
 * защищать demo от брутфорса не требуется).
 *
 * Ключ — email (после resolveLoginEmail в lib/actions/auth.ts), не IP:
 * заголовки вида x-forwarded-for можно подделать, если reverse proxy не
 * настроен явно — доверять им без отдельной конфигурации небезопасно.
 * Минус: злоумышленник теоретически может специально 5 раз ошибиться
 * чужим email, чтобы временно заблокировать вход этому пользователю
 * (self-lockout DoS). Принято для v1 — это не хуже отсутствия лимита
 * вовсе (неограниченный подбор пароля) и не требует БД/внешнего стора;
 * будущее улучшение — комбинировать email с IP из доверенного reverse
 * proxy либо вынести стейт во внешний store при переходе на serverless
 * multi-instance.
 */

interface AttemptState {
  failedCount: number;
  windowStart: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptState>();

function maxAttempts(): number {
  return Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) || 5;
}
function windowMs(): number {
  return Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60_000;
}
function lockoutMs(): number {
  return Number(process.env.LOGIN_RATE_LIMIT_LOCKOUT_MS) || 15 * 60_000;
}

/** true, если email сейчас заблокирован — lockout ещё действует. */
export function isLoginLocked(email: string): boolean {
  const state = attempts.get(email);
  if (!state?.lockedUntil) return false;
  if (Date.now() >= state.lockedUntil) {
    attempts.delete(email);
    return false;
  }
  return true;
}

/** Зафиксировать неудачную попытку; включает lockout при достижении порога. */
export function registerFailedLogin(email: string): void {
  const now = Date.now();
  const state = attempts.get(email);
  if (!state || now - state.windowStart > windowMs()) {
    attempts.set(email, { failedCount: 1, windowStart: now, lockedUntil: null });
    return;
  }
  state.failedCount += 1;
  if (state.failedCount >= maxAttempts()) {
    state.lockedUntil = now + lockoutMs();
  }
}

/** Успешный вход — сбросить счётчик неудачных попыток для email. */
export function resetLoginAttempts(email: string): void {
  attempts.delete(email);
}
