# Dental Pro CRM — Release Candidate Checklist v1

**by AV Systems** · создано в сессии 53 (Final QA / Release Candidate Checklist v1)

Этот документ — сводный QA/release-чеклист для v1.0. Он **не дублирует**
детальный security-аудит ([PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md))
или клиентский demo-сценарий ([DEMO_PRESENTATION.md](DEMO_PRESENTATION.md)) —
ссылается на них и агрегирует факты в одну точку входа для решения
«можно ли показывать/деплоить v1.0».

---

## A. Статус релиза

- **Кандидат**: v1.0-rc1 (сессия 53, 2026-06-22).
- **Последний коммит на момент аудита**: `82f9ea3 chore: polish demo presentation`.
- **Что входит в v1 RC**: patients, appointments/calendar, dental chart,
  treatment plans/items, treatment consumables (usage/cost reports/reversal),
  finance (invoices/payments/debt reminders), documents/PDF, inventory
  (suppliers/receiving/reorder/corrections/units), patient communication
  history + WhatsApp click-to-chat, public response links (`/r/[token]`),
  reschedule options, recall tasks, patient feedback, notifications,
  admin/platform admin, production hardening, mobile UX polish, demo
  presentation polish.
- **Что НЕ входит** (намеренно, по плану проекта — см. §F/G): PDF user manual
  со скриншотами, WhatsApp Business API, payment gateway, full patient
  portal, analytics v2, внешние security-сканеры.
- Multi-tenant SaaS, бизнес-логика и Prisma schema в этой сессии **не
  менялись**.

## B. Чеклист core workflows

Источник истинности — `docs/SESSION_HANDOFF.md` §3 («Состояние модулей»)
и профильные docs. Все перечисленные e2e — зелёные на момент аудита
(см. §«Checks» итогового отчёта сессии).

| Workflow | E2E | Статус |
|---|---|---|
| Login / demo-login | `e2e-demo-flow-check` (19/19), `e2e-release-candidate-check` (новый) | ✅ |
| Clinic / user / role access | `e2e-admin-check`, `e2e-platform-admin-check` | ✅ |
| Patients | `e2e-patients-check` | ✅ |
| Appointments | `e2e-appointments-check` | ✅ |
| Dental chart | `e2e-dental-chart-check` | ✅ |
| Treatment plan/item | `e2e-treatments-check` | ✅ |
| Treatment consumables (usage/cost/reversal) | `e2e-treatment-consumable-usage-check`, `e2e-consumable-cost-reports-check`, `e2e-treatment-consumable-reversal-check`, `e2e-consumables-audit-visibility-check` | ✅ |
| Finance / invoices / payments | `e2e-finance-check` | ✅ |
| Debt reminders | `e2e-debt-reminders-check` | ✅ |
| Documents / PDF | `e2e-documents-check`, `e2e-file-uploads-check`, `e2e-document-clinical-links-check` | ✅ |
| Inventory / suppliers / receiving / reorder | `e2e-inventory-check`, `e2e-inventory-corrections-check`, `e2e-inventory-units-check`, `e2e-supplier-catalog-check`, `e2e-supplier-orders-check`, `e2e-supplier-receiving-check`, `e2e-low-stock-alerts-check`, `e2e-low-stock-reorder-drafts-check`, `e2e-supplier-order-draft-approval-check` | ✅ |
| Appointment reminders | `e2e-appointment-reminder-scheduling-check` | ✅ |
| Patient response links (`/r/[token]`) | `e2e-patient-response-links-check` | ✅ |
| Reschedule options | `e2e-patient-reschedule-options-check` | ✅ |
| Recalls | `e2e-recall-tasks-check` | ✅ |
| Feedback | `e2e-patient-feedback-check` | ✅ |
| Notifications | `e2e-notifications-check` | ✅ |
| Communications / WhatsApp click-to-chat | `e2e-communications-check` | ✅ |
| Mobile UX | `e2e-mobile-ux-check` | ✅ |
| Production hardening | `e2e-production-hardening-check` | ✅ |

## C. Security checklist

Полный аудит — [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) (сессия
48). Ниже — выжимка, проверена повторно в сессии 53:

- ✅ **Tenant isolation**: `tenantClient(user.clinicId)` — единая точка
  скоупинга; 25/25 файлов `lib/actions/*.ts` ссылаются на `clinicId`, 146
  использований `tenantClient` (проверено grep'ом в этой сессии). Единственное
  документированное исключение — `lib/actions/platform.ts` (super_admin,
  с обязательной перепроверкой `clinic.findFirst`).
- ✅ **Permission guards**: 120 вызовов `requirePermission` по `app/`+`lib/actions/`;
  24/24 файлов action-слоя имеют ровно столько проверок, сколько в них
  экспортируемых actions (кроме `auth.ts`/`patient-response.ts` — намеренные
  исключения, см. PRODUCTION_HARDENING.md §4).
- ✅ **Public token expiry/single-use** (`/r/[token]`): `randomBytes(32)`
  (256 бит), формат-валидация до похода в БД, `expiresAt` проверяется во
  всех submit-actions (48ч confirm/reschedule, 7 дней feedback), атомарный
  `updateMany({status:"active"})` compare-and-swap против race/replay.
  Подтверждено повторно в этой сессии: `/r/bad-token` отдаёт generic
  «expired/not found» состояние без утечки (имя пациента, врача и т.д.
  отсутствуют в ответе) — см. новый `e2e-release-candidate-check.ts` §F.
- ✅ **Нет raw secrets**: `.env` не трекается, `.env.example` — только
  placeholder-значения (проверено `git ls-files` + ручным просмотром в этой
  сессии).
- ✅ **Production `SESSION_SECRET`**: `lib/session.ts` — `throw` при отсутствии
  в `NODE_ENV=production` (fail fast, без silent-фолбэка).
- ✅ **`AUTH_MOCK` отключён в production**: игнорируется кодом при
  `NODE_ENV=production`, даже если переменная по ошибке оставлена `true`.
- ✅ **Health endpoint безопасен**: `/api/health` — статичный без БД;
  `/api/health/db` — реальный пинг, но raw-ошибка Prisma идёт только в
  server-лог, публичный ответ — `{ok:false, db:"disconnected", error:"db_unreachable"}`
  (подтверждено `e2e-release-candidate-check.ts` §E — `ok:boolean`, `db:string`).

## D. Deployment checklist

- **Env vars** (полный список — `.env.example`, сверен с
  [DEPLOYMENT.md](DEPLOYMENT.md) в этой сессии, расхождений не найдено):
  `DATABASE_URL`, `SESSION_SECRET`, `AUTH_MOCK`, `SEED_DEMO_PASSWORD`,
  `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_APP_URL` (опционально),
  `PLATFORM_OWNER_EMAIL`/`_PASSWORD`/`_LOGIN`/`_NAME` (опционально).
- **DB migration/deploy**: `npm run prod:migrate` (`prisma migrate deploy`,
  идемпотентно) или `npm run prod:update` (+ generate + build). VPS-инструкция
  — DEPLOYMENT.md; Vercel+Neon — `npm run demo:deploy:init`
  (FREE_DEMO_DEPLOY.md).
- **Seed/demo data**: `npm run db:seed` — идемпотентен (upsert/create-if-not-exists),
  безопасно перезапускать. Текущее покрытие задокументировано в
  [DEMO_PRESENTATION.md](DEMO_PRESENTATION.md) §6 (включая намеренные пустые
  Recall/Feedback/Communications на свежем seed).
- **Vercel/Neon notes**: direct (non-pooled) connection string обязателен
  для `prisma migrate deploy`; `postinstall` гоняет `prisma generate`
  автоматически. Подробности — FREE_DEMO_DEPLOY.md.
- **File upload/storage limitation**: `uploads/` — локальный диск, не
  переживает редеплой на Vercel (serverless, ephemeral FS). Для production
  клиники — VPS с постоянным диском ИЛИ S3-совместимый сервис (единственная
  точка замены — `lib/storage.ts`, см. DOCUMENTS.md).
- **Backup notes** (DEPLOYMENT.md §5, расписание/retention/monitoring —
  [BACKUP_MONITORING.md](BACKUP_MONITORING.md), сессия 54): `pg_dump -Fc -d
  dental_pro_crm -f backup_$(date +%Y%m%d).dump` для БД + отдельный backup
  `uploads/` (tar/rsync) + `.env` хранить отдельно в защищённом
  секрет-менеджере. Без backup'а `uploads/` записи в БД будут указывать на
  отсутствующие файлы. Автоматизация (cron/managed backup) — задокументирована,
  но не настроена (намеренно — зависит от целевого сервера), см. §G.
- **Deployment runbook** ([DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md),
  сессия 54): пошаговый чеклист конкретного деплоя — pre-deploy, миграция,
  seed caution, build, smoke tests (login/dashboard/health/`/r/bad-token`),
  rollback notes, post-deploy.

## E. Demo checklist

Полный сценарий — [DEMO_PRESENTATION.md](DEMO_PRESENTATION.md) (сессия 52).
Кратко:

- **Demo-логины**: `admin@demo.dentalpro.az` / `admin123` (публичный
  Vercel-demo) — алиас `admin`; локальный dev — `Demo1234!` (см. SETUP.md,
  это намеренно два разных пароля для двух сред, не баг).
- **Demo-flow**: Login → Dashboard → Pasiyent kartı → Qəbul → Müalicə/Diş
  xəritəsi → Maliyyə/долг → Əlaqə tarixçəsi → Recall/Feedback → Anbar →
  Admin/Ayarlar (10 шагов, подробности и реплики по ролям — DEMO_PRESENTATION.md §3-4).
- **Что НЕ обещать**: WhatsApp Business API, payment gateway, full patient
  portal, PDF user manual со скриншотами (финальная фаза) — см. §F ниже.

## F. Known limitations

Источники: PRODUCTION_HARDENING.md §9, профильные docs (PATIENT_RESPONSE_LINKS,
RECALL_TASKS, PATIENT_FEEDBACK, DEBT_REMINDERS, FINANCE, INVENTORY,
SUPPLIER_*), плюс находки этой сессии.

**Продуктовые (намеренно не реализованы, по плану проекта):**
- Нет WhatsApp Business API — только manual click-to-chat (`wa.me`).
- Нет автоматической отправки (WhatsApp/SMS/email) — всё по ручному клику
  сотрудника.
- Нет payment gateway / онлайн-оплаты.
- Нет full patient portal — только одноразовые токенизированные ссылки
  (`/r/[token]`) под конкретное действие.
- Нет PDF user manual со скриншотами — финальная фаза проекта.
- CodeQL + базовый CI + `npm audit` настроены (сессия 55, см.
  [EXTERNAL_AUDIT.md](EXTERNAL_AUDIT.md)); Snyk/OWASP ZAP/SonarQube — всё
  ещё только документированы, не настроены (платные/нужны отдельные
  токены) — см. PRODUCTION_HARDENING.md §10.

**Технические (приняты для MVP/v1, задокументированы ранее):**
- **Local filesystem storage** (`uploads/`) не подходит для serverless —
  единственная точка замены `lib/storage.ts` (см. §D).
- **Notification read-state на уровне tenant**, не per-user — один сотрудник
  прочитал, отметка видна всем (NOTIFICATIONS.md).
- **JWT permission snapshot** — до 12ч TTL; деактивация/смена роли вступает
  в силу при следующем входе, не мгновенно.
- **`AUTH_MOCK`-ветка** в `lib/actions/auth.ts` всё ещё присутствует в коде
  (безопасна в production благодаря fail-safe в session.ts, но это legacy —
  удаление отдельной small-сессией).
- **Rate limiting** на `/login` и `/r/[token]` не реализован (см.
  PRODUCTION_HARDENING.md §10 — рекомендован как future hardening).
- i18n: `ru`/`en` — стаб-алиасы на `az` (`lib/i18n.ts`), полный перевод —
  v1.2 по плану.
- Время приёмов — таймзона сервера (= клиники, Asia/Baku), не tz-aware
  мультирегионально (`lib/actions/appointments.ts`, MVP-допущение).

**Процессные (найдено в этой сессии, не исправлено — см. §G):**
- 14 из 39 `scripts/e2e-*.ts` не зарегистрированы как `npm run` script
  (запускаются только через `npx tsx scripts/<name>.ts`) — стиль/удобство,
  не функциональный баг. В этой сессии добавлены 4 (`e2e-notifications-check`,
  `e2e-communications-check`, `e2e-finance-check`, `e2e-release-candidate-check`);
  остальные 14 — не трогались (вне named scope сессии 53).

## G. Remaining before v1.0

Приоритизированный список:

1. **Final deploy environment verification** — реальный прогон
   `demo:deploy:init`/`prod:update` на целевой инфраструктуре (Vercel+Neon
   или VPS) с боевыми `SESSION_SECRET`/`DATABASE_URL`, не только локально.
2. **Backup/monitoring automation** — policy и команды задокументированы
   (сессия 54, [BACKUP_MONITORING.md](BACKUP_MONITORING.md)); осталось
   реально настроить cron/managed backup у хостинг-провайдера и подключить
   `/api/health`+`/api/health/db` к внешнему uptime-монитору на целевой
   инфраструктуре (см. DEPLOYMENT.md §8).
3. **PDF user manual со скриншотами** — финальная фаза проекта (намеренно
   не в этой и не в предыдущих сессиях).
4. **Внешний security-аудит** — CodeQL + `npm audit` настроены (сессия 55,
   [EXTERNAL_AUDIT.md](EXTERNAL_AUDIT.md)); Snyk/OWASP ZAP/SonarQube —
   опционально, не блокирует v1.0, но рекомендован до масштабирования на
   реальных клиентов (требуют отдельных аккаунтов/токенов).
5. **Real clinic pilot feedback** — пилот с одной реальной клиникой, чтобы
   подтвердить продуктовые допущения (рабочие часы, роли, объём seed-данных)
   на живых данных перед широким релизом.
6. *(низкий приоритет)* Зарегистрировать оставшиеся 14 e2e-скриптов в
   `package.json` для единообразия (см. §F «Процессные»).
7. *(низкий приоритет)* Удалить legacy `AUTH_MOCK`-ветку из
   `lib/actions/auth.ts`/`lib/constants.ts` после стабилизации на реальной БД.
8. **CI e2e: расширение до обязательного gate** — DB-backed e2e smoke
   настроен в сессии 56 (manual-only, `workflow_dispatch`, 3 из 40
   наборов). **Сессии 57-59**: workflow построчно проверен, найден и
   исправлен реальный сбой migration portability (сессия 58) и
   стабилизирован flaky-assertion в e2e (сессия 59). **Сессия 60**:
   ✅ `E2E Smoke` прошёл полностью зелёным (прогон №3, commit
   `0a7131d`), вместе с `CI` и `CodeQL` на том же коммите — DB-backed
   e2e в GitHub Actions подтверждён рабочим. Путь к обязательному gate
   на push/PR (расширение matrix, перевод с `workflow_dispatch`) — см.
   [CI_E2E_STRATEGY.md](CI_E2E_STRATEGY.md) §6/§10, не блокирует
   текущую готовность.

## См. также

- [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) — полный security-аудит.
- [DEMO_PRESENTATION.md](DEMO_PRESENTATION.md) — клиентский demo-сценарий.
- [DEPLOYMENT.md](DEPLOYMENT.md) / [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md) — деплой.
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — шаги конкретного деплоя + smoke tests (сессия 54).
- [CI_E2E_STRATEGY.md](CI_E2E_STRATEGY.md) — DB-backed e2e в CI, manual-first стратегия (сессия 56).
- [BACKUP_MONITORING.md](BACKUP_MONITORING.md) — backup-расписание, retention, monitoring (сессия 54).
- [EXTERNAL_AUDIT.md](EXTERNAL_AUDIT.md) — CodeQL/CI/npm audit, внешние сканеры, manual audit checklist (сессия 55).
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — статус модулей, e2e-итоги, история сессий.
