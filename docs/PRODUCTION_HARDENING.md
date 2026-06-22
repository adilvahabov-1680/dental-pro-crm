# Production Hardening / Security Review (v1)

Сессия 48. Аудит существующей архитектуры безопасности + точечные fixes.
**Не** аудит зависимостей (npm/Snyk/CodeQL) и **не** пентест — см. §7
«Рекомендуемые будущие аудиты» для инструментов, которые этот документ не
заменяет.

## 1. Public routes

Ровно 4 маршрута без авторизации (`middleware.ts`):

| Route | Назначение | Доступ |
|---|---|---|
| `/login` | Вход | редиректит залогиненного на `/dashboard` |
| `/r/[token]` | Patient response/reschedule/feedback (см. ниже) | только по token |
| `/api/health` | Статичный health check (reverse proxy/process manager) | без БД, без авторизации |
| `/api/health/db` | Реальный пинг Postgres (monitoring/alerting) | без авторизации, без утечки деталей ошибки (сессия 48) |

Всё остальное идёт через middleware → `requireAuth`/`requirePermission`/
`requireRole` на каждой странице (см. §3). Новых public routes в этой
сессии не создавалось — scope явно запрещал это.

## 2. Token-based flows (`/r/[token]`)

Источник: `lib/patient-response.ts`, `lib/actions/patient-response.ts`.
Один механизм используется тремя purpose: `confirm_appointment`,
`reschedule_offer`, `feedback`.

- **Генерация**: `randomBytes(32).toString("base64url")` — 256 бит
  энтропии, криптослучайный, непредсказуемый.
- **Формат**: `TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,64}$/` — мусорный/чужой
  формат отклоняется до похода в БД.
- **Expiry**: `expiresAt` проверяется явно (`getPublicResponseLinkState`,
  все 3 submit-actions) — `reschedule_offer`/`confirm_appointment`: 48ч;
  `feedback`: 7 дней.
- **Single-use**: атомарный `updateMany({ where: { id, status: "active" } })`
  compare-and-swap. Конкурентный/повторный сабмит получает `count === 0` →
  `{ error: "alreadyUsed" }`. Race-safe без отдельной блокировки.
- **Scope из token, не из клиента**: `clinicId`/`patientId`/`appointmentId`
  берутся ТОЛЬКО из найденной по `token` записи `PatientResponseLink`.
  Никакой другой id с клиента не принимается.
- **Минимум данных в публичном ответе**: `clinicName`, `patientName`,
  `doctorName`, `startsAt`, `serviceName`, `options` (стабильные `"1"/"2"/"3"`,
  не db id). Никаких raw UUID, никакой финансовой/документной информации.
  Подтверждено e2e (см. §8).
- **revoked** (старые `reschedule_offer`-ссылки при создании новых)
  показывается как `kind: "used"` — пациенту не раскрывается, что ссылка
  именно отозвана, а не использована.

## 3. Tenant isolation

Правило: `clinicId` всегда из `tenantClient(user.clinicId)`
(`lib/tenant.ts`), **никогда** из формы/клиента — кроме одного явного,
осознанного исключения (см. ниже).

- `tenantClient(clinicId)` — Prisma `$extends`, автоматически добавляет
  `clinicId` в `where`/`data` для всех моделей из `TENANT_MODELS`.
  `findUnique`/`update`/`delete` по голому id **не** фильтруются
  автоматически — поэтому весь код использует `findFirst`/`updateMany` с
  явным id+scope (см. `safeUpdateByTenant`/`safeDeleteByTenant`) или
  переходит через `getXForUser`-хелперы.
- **Единственное исключение**: `lib/actions/platform.ts` принимает
  `clinicId` из формы (`setClinicStatus`, `platformCreateUser`) — это
  ожидаемо, т.к. `super_admin` не имеет своего `clinicId` и обязан указать,
  какой клиникой управляет. Защита: `requireRole("super_admin")` +
  обязательная перепроверка `prisma.clinic.findFirst({ id: clinicId,
  deletedAt: null })` перед использованием. Других мест с client-provided
  `clinicId` в проекте не найдено (проверено по всем `lib/validation/*.ts`
  и `components/**`).
- **Super admin (`clinicId: null`)** не может случайно мутировать tenant
  data: каждое clinic-scoped действие (`lib/actions/admin.ts`,
  `/admin` page) начинается с `if (!user.clinicId) return/redirect` —
  даже при наличии permission (super_admin имеет `admin.manage` в
  `DEFAULT_ROLE_PERMISSIONS` для платформенных нужд, но эта проверка
  блокирует выполнение).
- Модули сессий 41–47 (response links, reschedule, recall, feedback, debt
  reminders) — все построены на одном паттерне (`getXForUser`/
  `patientScopeWhere`/`tenantClient`) и имеют собственные e2e с
  cross-tenant проверкой (см. §8 — таблица регрессий).

## 4. Permission map (актуальные guard'ы)

Аудит (сессия 48): **24 из 24** файлов `lib/actions/*.ts` имеют ровно
такое же количество `await require(Permission|Role|Auth)(...)` вызовов,
сколько в них экспортируемых server actions — кроме двух намеренных
исключений:

- `lib/actions/auth.ts` (`login`/`logout`) — точка входа, по определению
  без permission-проверки.
- `lib/actions/patient-response.ts` (3 public actions) — публичный
  no-login flow, scope из token (см. §2), не из permission.

Страницы (`requirePermission` на каждой модульной странице, `app/(dashboard)/**`):

| Маршрут | Permission |
|---|---|
| `/finance/debts` | `finance.view` |
| `/feedback` | `patients.view` |
| `/recalls` | `treatments.view` (recall — домен treatments, не appointments) |
| `/treatments/[id]/recall` (создание recall) | `treatments.manage` |
| `/admin` | `admin.view`, мутации — `admin.manage` |
| `/platform/clinics*` | `requireRole("super_admin")` |

Действия:

| Action | Permission |
|---|---|
| `prepareInvoiceReminder` (debt reminder) | `finance.manage` |
| `prepareFeedbackLinkAction` | `patients.manage` |
| `createRecallTaskAction` / `prepareRecallMessageAction` / `markRecallScheduledAction` / `dismissRecallAction` | `treatments.manage` |
| `markNotificationRead` / `markAllNotificationsRead` | `notifications.view` + `notificationScopeWhere(user)` внутри `updateMany`-where (чужое/невидимое уведомление не попадает в where) |

`dev-check`-страница (`/dev-check`) — `notFound()` если
`NODE_ENV !== "development"`; в production инертна, недоступна.

## 5. Secrets & repo hygiene

- `.env` не трекается; `.env.example` — только placeholder-значения, без
  реальных секретов (проверено `git grep`).
- `.pglocal/` (локальная PostgreSQL), `uploads/` (сгенерированные
  PDF/загруженные файлы) — не трекаются.
- `.gitignore` (сессия 48): добавлен `.vercel/` (CLI-метаданные проекта
  при `vercel link`/`vercel dev`, см. `docs/FREE_DEMO_DEPLOY.md`) — раньше
  отсутствовал, хотя Vercel — документированный путь деплоя.
- Нет `console.log`/`console.debug` в `app/lib/components` (только
  `console.error` — намеренное логирование ошибок).
- Хардкод `localhost` — только `lib/patient-response.ts` как fallback
  построения абсолютного URL (`x-forwarded-host`/`host` имеют приоритет;
  безопасно и документировано) и сами e2e-скрипты (`E2E_BASE_URL` по
  умолчанию `localhost:3000` — допустимо для dev-скриптов).

## 6. Production hardening fixes (сессия 48)

| Файл | Было | Стало |
|---|---|---|
| `lib/session.ts` | Без `SESSION_SECRET` — silent fallback на строку, видимую в этом публичном репозитории (JWT подделываемы) | `NODE_ENV==="production"` + нет `SESSION_SECRET` → throw (fail fast). Dev-фолбэк не менялся |
| `lib/actions/auth.ts` | `AUTH_MOCK=true` работал независимо от окружения | Игнорируется при `NODE_ENV==="production"` — mock-вход с захардкоженным паролем невозможен в production даже при ошибочной конфигурации |
| `app/api/health/db/route.ts` | Публично (без auth) отдавал raw `e.message` Prisma (может содержать internal host/порт БД) | Реальная ошибка — только `console.error` (server-лог); публичный ответ — `{ error: "db_unreachable" }` |
| `.gitignore` | Без `.vercel/` | Добавлено |

Ни одно из изменений не трогает успешный путь в dev/корректно
сконфигурированном production — только реакция на misconfiguration.
Без миграции схемы.

## 7. Build/runtime checklist

```bash
npx tsc --noEmit          # 0 ошибок
# остановить next dev перед build (общий .next/ — конфликт воркеров)
npm run build              # чистая production-сборка
npm run e2e-production-hardening-check
# + регрессии (см. docs/SESSION_HANDOFF.md, секция сессии 48)
```

Перед реальным production-деплоем (см. также `docs/SETUP.md`,
`docs/DEPLOYMENT.md`):

- [ ] `SESSION_SECRET` — криптослучайный (`openssl rand -base64 32`), не
      значение из `.env.example`.
- [ ] `AUTH_MOCK=false` (или не задан) — теперь дополнительно
      подстрахован кодом (см. §6), но переменная всё равно должна быть
      выставлена явно.
- [ ] `NEXT_PUBLIC_DEMO_MODE=false` (или не задан) для реальной клиники.
- [ ] demo-пользователи (`admin@demo.dentalpro.az` и т.д.) — удалены или
      пароли сменены, если seed запускался на production БД.
- [ ] `DATABASE_URL` — отдельная БД/пользователь, не shared dev-инстанс.
- [ ] storage — `uploads/` локальный диск только для self-hosted/VPS; для
      serverless (Vercel) — заменить на S3-совместимый (см.
      `docs/DOCUMENTS.md`, `lib/storage.ts` — единственная точка замены).

## 8. E2E

`npx tsx scripts/e2e-production-hardening-check.ts` — новые проверки,
не покрытые существующими модульными e2e:

- public token: нет утечки raw UUID на странице `/r/[token]` (active/
  expired/used), feedback/reschedule страницы не содержат финансовых/
  документных терминов;
- permission guards: `finance.view`-less → `/finance/debts` отказ;
  `patients.view`-less → `/feedback` отказ; `treatments.view`-less →
  `/recalls` отказ; неавторизованный POST debt/feedback/recall-actions не
  создаёт записей;
- notification scope: невидимый тип не считается в bell-счётчике,
  видимый — помечается прочитанным;
- repo hygiene: `.env`/`.pglocal`/`.next`/`node_modules`/`uploads` не
  затрекены (`git ls-files`).

Уже покрыто существующими профильными e2e (не дублировалось,
см. регрессии): cross-tenant изоляция response links/reschedule/recall/
feedback/debt reminders, нормализация телефона, single-use токенов,
document download scope/permission/path traversal.

## 9. Known limitations (приняты, не фиксились в этой сессии)

- **JWT permission snapshot** действует до перелогина (макс. 12ч TTL) —
  отзыв права/деактивация вступает в силу только при следующем входе.
  Принято для MVP (см. `docs/DEVELOPMENT_RULES.md`); рефактор auth —
  явно вне scope сессии 48.
- **AUTH_MOCK-ветка** в `lib/actions/auth.ts` всё ещё присутствует в коде
  (теперь безопасна в production благодаря §6, но сама ветка — legacy,
  предназначена к удалению после миграций; удаление — отдельная small
  сессия, не делалось здесь, чтобы не трогать authentication шире
  необходимого).
- **Local filesystem storage** (`uploads/`) не подходит для serverless
  (Vercel) — единственная точка замены документирована (`lib/storage.ts`).
- **Per-user read-state** для tenant-level notifications не хранится
  (один сотрудник прочитал → прочитано для всех) — принято для v1 (см.
  `docs/NOTIFICATIONS.md`).
- **`/api/health/db`** остаётся без авторизации (нужно для
  monitoring/alerting) — теперь не раскрывает детали ошибки, но сам факт
  доступности эндпоинта (ping) остаётся публичным по дизайну.

## 10. Рекомендуемые будущие аудиты

Не выполнялись в этой сессии (вне scope — "external security scanner
integration"), но рекомендуются как следующий шаг:

- **GitHub CodeQL** — статический анализ на known vulnerability patterns.
- **Snyk / `npm audit`** — уязвимости в зависимостях (`package-lock.json`).
- **OWASP ZAP** — динамическое сканирование живого деплоя (staging).
- **SonarQube** — code quality + security hotspots на постоянной основе.
- **Manual business logic audit** — отдельная сессия per модулю
  (например, advisory locks в finance под реальной нагрузкой,
  rate-limiting на `/login` и `/r/[token]`, который сейчас не реализован).
