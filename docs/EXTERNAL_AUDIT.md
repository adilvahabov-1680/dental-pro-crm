# Dental Pro CRM — External Audit Setup v1

**by AV Systems** · создано в сессии 55 (External Audit Setup / CodeQL + Dependency Scan v1)

Этот документ — чеклист внешних/независимых проверок безопасности и
качества кода перед/после v1.0, плюс шаблон для фиксации результатов
(evidence). Внутренний security-аудит архитектуры — уже сделан и описан в
[PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) (сессия 48) — этот
документ **не повторяет** его, а описывает, какие **внешние инструменты**
запускать и как фиксировать находки.

---

## 1. Автоматические проверки (настроены в этой сессии)

### 1.1 GitHub CodeQL — `.github/workflows/codeql.yml`

- Статический анализ кода (JavaScript/TypeScript) на известные паттерны
  уязвимостей (SQL injection, XSS, path traversal, insecure randomness и т.п.).
- Триггеры: `push` на `main`, `pull_request` на `main`.
- Без секретов, без подключения к БД, без migration/seed — CodeQL для
  JS/TS анализирует исходный код, реальная сборка/живая БД не нужна.
- Результаты — вкладка **Security → Code scanning alerts** в GitHub repo.

### 1.2 npm audit (dependency scan)

```bash
npm audit --audit-level=moderate
```

- Проверяет известные уязвимости в зависимостях (`package-lock.json`) по
  базе GitHub Advisory Database.
- **Не входит в CI в этой сессии** — нет смысла «ломать» pipeline на
  известный, недоступный для исправления riski (см. §4 «Текущие находки»,
  `xlsx`); запускать вручную перед релизом/периодически.
- Скрипт: `npm run audit:deps` (добавлен в этой сессии, тот же flag).

### 1.3 Базовый CI — `.github/workflows/ci.yml`

- `checkout → setup-node → npm ci → prisma generate → tsc --noEmit → npm run build`.
- Только dummy env-значения (`DATABASE_URL`, `SESSION_SECRET` и т.д.) —
  подтверждено эмпирически (сессия 55): `next build` не требует реального
  подключения к БД (ни одна страница не делает DB-запрос на этапе build —
  все модульные страницы `ƒ Dynamic`, единственная `○ Static` — `/login`,
  без DB-запроса).
- **E2E-наборы (требуют живую Postgres + seed) в CI НЕ запускаются** — нет
  настроенной CI-БД. См. §1.4 «Будущее: E2E в CI».

### 1.4 Будущее: E2E в CI (документировано, не настроено)

Чтобы прогонять `npm run e2e-*-check` в CI, потребуется:

1. Сервис-контейнер Postgres в workflow (`services: postgres:` в GitHub
   Actions) или managed CI-БД.
2. `DATABASE_URL`, указывающий на этот контейнер (не dummy).
3. `npx prisma migrate deploy` + `npm run db:seed` перед запуском e2e.
4. Запуск `npm run build && npm run start &` (или `npm run dev &`) перед
   e2e (e2e-скрипты ходят по HTTP на `localhost:3000`).

Не сделано в этой сессии — осознанно, чтобы не плодить hidden-state CI
(тестовая БД, которая может не совпадать с production-конфигурацией) без
отдельного решения о том, где она живёт. См. §G в
[RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md).

## 2. Внешние инструменты (только документация — НЕ настроены в этой сессии)

Платные/требующие отдельной интеграции/токенов — намеренно не подключены
(правило сессии: «не добавлять платные integration secrets»).

| Инструмент | Что проверяет | Как запустить (ручной/будущий шаг) |
|---|---|---|
| **Snyk** | Уязвимости зависимостей + лицензии, более глубокий анализ, чем `npm audit` | `npx snyk test` (требует `snyk auth` — отдельный аккаунт/токен, не настроен) |
| **OWASP ZAP** | Динамическое сканирование живого деплоя (XSS, injection, broken auth и т.п. на реальных HTTP-ответах) | Запустить ZAP (Docker: `zap-baseline.py`) против staging-URL **после деплоя**, не против localhost dev-сервера с demo-данными как production |
| **SonarQube / SonarCloud** | Code quality + security hotspots на постоянной основе, code smells, duplication | Требует SonarCloud-аккаунт + токен (CI-интеграция — future, не в этой сессии) |
| **GitHub Dependabot** | Альтернатива/дополнение к `npm audit` — автоматические PR на обновление уязвимых зависимостей | Включается в Settings → Security → Dependabot (репо-настройка, не код; можно включить без токенов) |

## 3. Manual audit checklist (ручные проверки, без инструментов)

Эти пункты **уже проверялись** при реализации соответствующих модулей
(см. ссылки) — здесь они собраны как **чеклист для периодического
повторного прогона** (например, перед крупным релизом или после
значительного изменения соответствующей области).

- [ ] **Public token flow audit** (`/r/[token]`) — `randomBytes(32)` (256
      бит), формат-валидация, `expiresAt` проверяется, atomic single-use
      (`updateMany` compare-and-swap), `/r/bad-token` отдаёт generic
      safe-состояние без утечки имён. См. PRODUCTION_HARDENING.md §2,
      `e2e-patient-response-links-check`, `e2e-release-candidate-check` §F.
- [ ] **Tenant isolation audit** — весь бизнес-код проходит через
      `tenantClient(user.clinicId)`; единственное документированное
      исключение — `lib/actions/platform.ts` (super_admin, с обязательной
      перепроверкой). См. PRODUCTION_HARDENING.md §3 (25/25 файлов
      `lib/actions/*` ссылаются на `clinicId`, проверено в сессии 53).
- [ ] **Permission audit** — `requirePermission`/`requireRole` на каждой
      модульной странице и server action; формам не доверяем (всё
      перечитывается из БД по scope). См. PRODUCTION_HARDENING.md §4
      (120 вызовов `requirePermission`, проверено в сессии 53).
- [ ] **File upload/storage audit** — MIME-проверка по магическим байтам
      (не доверяем клиенту), `resolveUploadPath` режет path traversal,
      ограничение ≤10MB, soft-delete не удаляет физический файл сразу.
      См. DOCUMENTS.md, `lib/storage.ts`.
- [ ] **Backup/restore test** — реальное восстановление последнего backup
      в тестовую БД, проверка `prisma migrate status` + ключевых таблиц.
      Периодичность и процедура — [BACKUP_MONITORING.md](BACKUP_MONITORING.md) §3.
- [ ] **Demo/prod env review** — `AUTH_MOCK=false`, `NEXT_PUBLIC_DEMO_MODE=false`
      (или не задан), `SESSION_SECRET` — криптослучайный (не из
      `.env.example`), demo-пользователи удалены/пароли сменены если seed
      запускался на реальной БД. См. PRODUCTION_HARDENING.md §7,
      [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §0/§7.

## 4. Текущие находки (npm audit, сессия 55)

Снято `npm audit --audit-level=moderate` на коммите этой сессии:

| Пакет | Severity | Статус | Действие |
|---|---|---|---|
| `esbuild` (транзитивная зависимость `tsx`, dev-only) | low | ✅ исправлено | `npm audit fix` — патч-версия 0.28.0→0.28.1, без breaking changes (dev-only, никогда не попадает в production-бандл) |
| `postcss` (вложена внутрь `next`'s `node_modules`, не прямая зависимость) | moderate | ⚠️ принято, не исправлено | Исправление требует `npm audit fix --force` → откатывает `next` до `9.3.3` (canary, breaking change) — **неприемлемо**. Ждать, пока сам Next.js обновит внутреннюю зависимость |
| `xlsx` (SheetJS, прямая зависимость — импорт прайс-листов поставщиков) | high | ⚠️ принято, не исправлено | **Нет фикса в npm-реестре** (prototype pollution + ReDoS). Митигация: вызов закрыт `requirePermission("inventory.manage")` (не публичный/анонимный эндпоинт), файл парсится только в памяти, не сохраняется на диск (см. DEPLOYMENT.md §6). Альтернатива — официальный SheetJS CDN-пакет (не npm) — не сделано в этой сессии, требует отдельного решения о смене источника зависимости |

**Итог**: 1 из 4 находок исправлена безопасно; 2 оставшиеся — приняты как
known risk с документированной митигацией (см. таблицу), 0 критических
(critical) находок.

## 5. Evidence template (для записи результатов аудита)

Использовать для каждого прогона любого инструмента из §1-§2 — копировать
блок ниже и заполнять:

```text
Tool: <CodeQL / npm audit / Snyk / OWASP ZAP / SonarQube / manual>
Date: <YYYY-MM-DD>
Commit: <git short hash>
Scope: <что проверялось — весь репо / конкретный модуль / staging URL>
Findings:
  - <finding 1: описание>
    Severity: <critical/high/moderate/low>
    Fix owner: <кто чинит>
    Status: <open/in-progress/accepted-risk/fixed>
  - <finding 2: ...>
Report link: <ссылка на полный отчёт, если есть — CI run, Snyk dashboard, ZAP report>
```

Хранить заполненные блоки в этом разделе (накопительно, новые сверху) или
в отдельном внутреннем трекере (Linear/Jira/etc.), если он используется
— в этом проекте на сессию 55 такого трекера нет, поэтому рекомендуется
здесь.

## См. также

- [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) — внутренний
  security-аудит архитектуры (сессия 48).
- [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) §C/F/G
  — security checklist, known limitations, remaining before v1.0.
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) / [BACKUP_MONITORING.md](BACKUP_MONITORING.md)
  — deploy/backup/monitoring (сессия 54).
