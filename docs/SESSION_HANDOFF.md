# Dental Pro CRM — Session Handoff
**by AV Systems** · обновлено: 2026-06-19 (после сессии 41: Patient Response Link Foundation v1)

Этот файл — точка входа для следующей сессии. Прочитать ПЕРЕД началом работы;
обновлять в конце каждой сессии. Детали по модулям — в profile-доках (ниже).

---

## 1. Что это

Multi-tenant стоматологическая CRM (Next.js 15 App Router + Prisma + PostgreSQL,
TypeScript, Tailwind v4). Язык интерфейса — AZ (i18n-foundation готов, ru/en —
v1.2). Деньги — Int в гяпиках. Зубы — FDI. Тёмная премиум-тема (DESIGN.md).

Главное правило: **малые итерации, не переписывать готовые модули,
не ломать регрессии** (DEVELOPMENT_RULES.md).

## 2. Запуск окружения

```powershell
# 1. PostgreSQL (портативная, .pglocal/; НЕ требует установки)
#    при ручном запуске вместо скрипта:
#    .pglocal\pgsql\bin\pg_ctl.exe start -D .pglocal\data -l .pglocal\postgres.log -w
powershell -ExecutionPolicy Bypass -File scripts\db-start.ps1

# 2. Seed (идемпотентный, можно повторять; demo-даты освежаются)
npm run db:seed

# 3. Dev server
npm run dev          # http://localhost:3000

# Проверки
npx tsc --noEmit
npm run build        # ВАЖНО: останавливать dev server перед build (общий .next)
```

Demo-логины (пароль задаётся через `SEED_DEMO_PASSWORD`, дефолт `admin123` для свежей БД;
локальная БД может иметь старый пароль если passwordHash не сбрасывался):
`admin@demo.dentalpro.az` (owner, алиас `admin`) · `hekim@demo.dentalpro.az` (doctor) ·
`assistent@demo.dentalpro.az` (assistant) · `super@demo.dentalpro.az` (super_admin, алиас `super`).

## 3. Состояние модулей (все e2e зелёные)

| Модуль | Статус | E2E |
|---|---|---|
| Pasiyentlər | готов | `e2e-patients-check` 22/22 |
| Diş xəritəsi | готов | `e2e-dental-chart-check` 23/23 |
| Qəbullar | готов | `e2e-appointments-check` 28/28 |
| Müalicə | готов | `e2e-treatments-check` 31/31 |
| Maliyyə (+ cancel invoice) | готов | `e2e-finance-check` 47/47 |
| Anbar | готов | `e2e-inventory-check` 33/33 |
| Dashboard (live) | готов | `e2e-dashboard-check` 20/20 |
| Bildirişlər (in-app v1) | готов | `e2e-notifications-check` 17/17 |
| Sənədlər / PDF v1 | готов | `e2e-documents-check` 36/36 |
| Fayl yükləmə (Uploads v1 + soft-delete + клин. привязки) | готов | `e2e-file-uploads-check` 39/39, `e2e-document-clinical-links-check` 19/19 |
| Ayarlar (Settings v1) | готов | `e2e-settings-check` 43/43 |
| Əlaqə / Patient Communication (v1, manual click-to-chat) | готов | `e2e-communications-check` 40/40 |
| Global Search (topbar, v1) | готов | `e2e-global-search-check` 22/22 |
| Admin (кадры/роли/врач-ассистент/transfer, v1+password/login+assignment+transfer) | готов | `e2e-admin-check` 36/36, `e2e-doctor-transfer-check` 12/12 |
| Treatment Protocols & Follow-up | готов | `e2e-treatment-protocols-check` 31/31 |
| Platform Admin (super_admin, клиники, platform owner) | готов | `e2e-platform-admin-check` 42/42 (+ check 19 conditional) |
| Supplier Catalog / Excel Import v1 | готов | `e2e-supplier-catalog-check` 23/23 |
| Supplier Orders v1 (draft→sent→received/cancelled, WhatsApp/email message) | готов | `e2e-supplier-orders-check` 38/38 |
| Supplier Receiving v1 (Anbara qəbul et per item, create/link InventoryItem) | готов | `e2e-supplier-receiving-check` 27/27 |
| Inventory Stock Corrections v1 (adjustment/adjustment_out/write_off, audit trail, note field) | готов | `e2e-inventory-corrections-check` 34/34 |
| Inventory Unit Conversions v1 (purchaseUnit, purchaseToBaseFactor, doseToBaseFactor) | готов | `e2e-inventory-units-check` 27/27 |
| Service Consumable Templates v1 (шаблоны расходников по услуге, template-only, no stock deduction) | готов | `e2e-service-consumable-templates-check` 30/30 |
| Treatment Consumable Usage v1 (фактическое списание по шаблонам, dose-конвертация, double-apply protection) | готов | `e2e-treatment-consumable-usage-check` 38/38 |
| Consumable Cost Reports v1 (отчёт по фактическим расходам, /reports/consumables, cost=baseQty×unitCost) | готов | `e2e-consumable-cost-reports-check` 30/30 |
| Treatment Consumable Reversal v1 (полный возврат списания, audit trail, reversal movement, re-apply после reversal) | готов | `e2e-treatment-consumable-reversal-check` 29/29 |
| Consumables Audit Visibility v1 (treatment card badges none/applied/reversed/reapplied, usage detail rows, audit trail section, movement labels, cost report link) | готов | `e2e-consumables-audit-visibility-check` 28/28 |
| Low Stock Alerts / Reorder Suggestions v1 (`/inventory/alerts`, out/low/warning статусы, reorder-tövsiyə, purchase unit конвертация, supplier visibility, read-only) | готов | `e2e-low-stock-alerts-check` 27/27 |
| Supplier Reorder Draft from Low Stock v1 (выбор материалов на `/inventory/alerts` → черновик(и) supplier order по поставщику, override количества, без авто-отправки/receiving/stock-мутации) | готов | `e2e-low-stock-reorder-drafts-check` 31/31 |
| Supplier Order Draft Approval Flow v1 (draft→approved через явное подтверждение, draft badge + note, mark-sent принимает draft/approved, receiving остаётся blocked, без авто-отправки) | готов | `e2e-supplier-order-draft-approval-check` 31/31 |

Запуск e2e: `npx tsx scripts/e2e-<module>-check.ts` (нужен dev server + seed).
MVP-цикл закрыт: Pasiyent → Qəbul → Diş xəritəsi → Müalicə → Hesab/Ödəniş →
Anbar/materiallar → Dashboard/Bildirişlər → PDF sənədlər → Ayarlar →
Əlaqə/Communication.

Demo smoke-check (сессия 18, не дублирует модульные наборы):
`e2e-demo-flow-check` 11/11 — login owner/doctor/assistant, dashboard,
global search, карточка пациента, hesab, Ayarlar, Admin, role-restrictions, /api/health.
Подробный демо-сценарий и известные ограничения — DEMO.md.

## 4. Ключевые конвенции (нарушение = регрессия)

- **Tenant**: ни одного бизнес-запроса без tenant-фильтра — только через
  `tenantClient(user.clinicId)` (lib/tenant.ts); точечные операции — через
  safe-хелперы (findUnique по голому id обходит фильтр!).
- **Scope**: пациентские данные — `patientScopeWhere` (doctor → свои пациенты,
  assistant → пациенты прикреплённого врача, учитывается clinic-setting
  `doctor_sees_all_patients`); приёмы — `appointmentScopeWhere`. Lib-функции
  `listPatient*` фильтруют только tenant — вызывать ТОЛЬКО после
  `getPatientForUser`/`getInvoiceForUser` (конвенция, см. self-check сессии 12).
- **Permissions**: `<module>.view/manage`, каталог в lib/permissions.ts;
  проверка в страницах (`requirePermission`) И в server actions; формам не
  доверяем — всё перечитывается из БД по scope.
- **Append-only**: Payment, ToothHistory, InventoryMovement, PdfRecord,
  AuditLog — не редактируются и не удаляются приложением.
- **Advisory locks**: нумерация счетов `'invoice:'+clinicId`, оплаты/отмена
  `'payment:'+invoiceId`, склад `'inv:'+itemId` — `::text` после lock
  (Prisma не читает void).
- **audit_log** на каждое значимое действие (create/update sensitive entities).
- **i18n**: все UI-строки через `getDict()` → i18n/az.ts; AZ-метки enum'ов —
  в lib/constants.ts (`*_META`).
- **E2E-техника**: HTTP + cookie-jar + POST форм server actions с $ACTION-полями;
  если на странице НЕСКОЛЬКО форм — выделять конкретную форму целиком
  регэкспом `<form[\s\S]*?<\/form>` и фильтровать по содержимому
  (`formContaining(html, ...needles)`, см. e2e-communications-check.ts) —
  поиск маркера по индексу в исходном HTML ненадёжен: RSC-стрим кладёт
  пропсы/текст в `<script>__next_f.push(...)</script>` ДО реального `<form>`.
- **E2E-quirk**: `notFound()` в этом dev-окружении отвечает HTTP 200
  (не 404) — проверять по содержимому страницы (отсутствие данных целевой
  сущности), не по статус-коду. `redirect()` из `requirePermission` даёт 3xx.
- **E2E-техника (форм с несколькими actions)**: `postForm(path, html, fields)` обходит
  все `$ACTION_*` inputs страницы и берёт ПОСЛЕДНИЙ встреченный ключ. Если на странице
  несколько Server-Action форм — передавать HTML **конкретной** формы (не всей страницы):
  `postForm(path, formContaining(pageHtml, 'data-e2e-marker'), fields)`.

## 5. PDF / storage (сессии 12, 14)

- pdfkit + DejaVu Sans (`dejavu-fonts-ttf`) — стандартные шрифты не знают ə/ş/ğ;
  `serverExternalPackages: ["pdfkit"]` в next.config.ts обязателен.
- Деньги в PDF — «AZN» (не ₼). Текст PDF в e2e проверяется через `pdf-parse` v2.
- Файлы: `uploads/documents/{clinicId}/{patientId}/…` (в .gitignore); в БД —
  relative path; `resolveUploadPath` режет traversal/absolute.
- **Загрузка файлов пациента (сессия 14)**: таблица `documents`, ≤10 MB,
  mime PDF/JPEG/PNG/WebP по магическим байтам (клиенту не доверяем), серверные
  имена в `…/{patientId}/uploaded/`; `serverActions.bodySizeLimit: "12mb"`
  в next.config.ts (дефолт 1 MB режет upload). Download route один на оба вида
  (pdf_records → documents). Детали — DOCUMENTS.md.
- **Soft-delete загруженных документов (сессия 14.5)**: кнопка «Sil»
  (documents.manage, только uploads) → deletedAt; **физический файл остаётся
  на диске**; удалённые скрыты везде и не скачиваются (404); pdf_records
  не удаляются. Restore — только через БД.
- **Клинические привязки + cleanup (сессия 19)**: документы можно опционально
  привязать к зубу (`toothRecordId`) и/или процедуре (`treatmentItemId`) —
  поля в schema уже были, schema не менялась; бейджи «Diş N» / «Müalicə: …»
  во всех списках, отображение в ToothPanel и на странице материалов
  процедуры; server-side проверка владения (patient + tenant scope).
  Превью изображений — `<img>` через существующий download route (без
  нового эндпоинта). `scripts/cleanup-deleted-documents.ts` (dry-run по
  умолчанию, `--execute` удаляет физические файлы soft-deleted `documents`,
  без cron). Детали — DOCUMENTS.md.
- **Production-долг**: serverless-деплой потеряет uploads/ — lib/storage.ts
  спроектирован как единственная точка замены на S3.

## 6. Известные риски / долги

- Git инициализирован (сессия 13.5, ветка main, baseline-коммит `2acc322`);
  identity задана локально в репозитории. Remote (GitHub и т.п.) не настроен.
- Tenant-level notifications: «прочитано» отмечается на записи (один прочитал —
  прочитано для всех); per-user read-state — таблица `notification_reads` в будущем.
- Low-stock notification не хранит id материала → ссылка на `/inventory?low=1`.
- Счёт с оплатами исправляется только через БД (до модуля возвратов).
- Номер PDF `SND-…` — косметический, без lock (дубликаты при гонке не ломают БД).
- В dev-БД остаются артефакты e2e-прогонов (E2E Test Material, тестовые
  пациенты) — для демо врачу пересоздать БД чистым seed.
- `default_appointment_minutes` применён в форме приёма (сессия 13.5,
  только prefill select'а; вне 5–480 → fallback 30, нестандартное значение
  добавляется в список). `working_hours` теперь заполняется в seed (сессия 18:
  Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun bağlı), но используется только
  для отображения в Ayarlar — нет валидации приёмов/расписания против этих
  часов. `reminder_hours_before` пока не читается scheduler'ом (его нет) —
  подключить при доработке.
- Upsert настроек — findFirst→update/create без транзакции (гонка двух админов
  теоретически даст дубликат ключа; unique-индекс с null-колонками её не ловит).
- **Communication v1 (сессия 15)**: `status = "prepared"` в Notification —
  только «текст/ссылка подготовлены», без подтверждения фактической отправки;
  повторный клик создаёт новую запись лога (намеренно). Подробности и
  ограничения — COMMUNICATIONS.md.
- **Global Search v1 (сессия 16)**: только `contains` (без fuzzy/полнотекста),
  8 результатов на группу; у пациента нет идентификатора (FIN) — поиск по
  имени/телефону; приёмы ссылаются на дневной вид календаря (детальной
  страницы нет). Подробности — GLOBAL_SEARCH.md.
- **Admin v1 (сессия 17, обновлено 24)**: деактивация, сброс пароля и смена
  логина не инвалидируют уже выданные JWT-сессии (до 12 ч); временный пароль
  нового сотрудника показывается один раз (нет email-инвайтов). Подробности — ADMIN.md.
- **Platform Admin v1 (сессия 24)**: suspended-статус клиники блокирует новые
  логины, но уже выданные JWT-сессии (до 12 ч) не инвалидируются. Подробности — PLATFORM_ADMIN.md.

## 7. Оставшиеся placeholder'ы

Кнопка «Pasiyent məlumat forması» (Tezliklə), **реальная** отправка
WhatsApp/SMS/email (v1 — только manual click-to-chat через wa.me, см.
COMMUNICATIONS.md), загрузка логотипа клиники (logoUrl в схеме, рендер в
PDF не делался), автоматический (cron) cleanup физических файлов
soft-deleted документов (v1 — ручной скрипт, см. DOCUMENTS.md).

## 7.1. Сессия 18 — итоги (MVP Hardening & Demo Readiness)

Polish-сессия без новых модулей/фич. Изменения:
- Удалены неиспользуемые i18n-ключи (`patients.detail.soon`/`futureNote`,
  `common.comingSoon`/`comingSoonDesc`) и неиспользуемый компонент
  `components/ui/ModulePlaceholder.tsx` (мёртвый код, проверено grep'ом).
- `prisma/seed.ts`: добавлен `working_hours` в `CLINIC_SETTINGS`
  (Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun bağlı) — раньше Ayarlar
  показывал клинику закрытой 7 дней в неделю. Идемпотентно (create-if-not-exists,
  не перетирает ручные значения).
- Деактивирован (`isActive=false`, без удаления) артефакт e2e-прогона
  "E2E Test Material" в Anbar — мешал на dashboard/low-stock в демо.
- `CommunicationHistoryBlock`: пустое состояние переведено на общий
  `EmptyState` (визуальное выравнивание с остальными модулями, без
  изменения логики).
- Создан DEMO.md (демо-логины, 10-минутный сценарий, известные ограничения,
  команды).
- Добавлен `scripts/e2e-demo-flow-check.ts` (10/10) — быстрый smoke-тест
  демо-пути перед показом клинике.
- Полный аудит placeholder'ов/disabled-кнопок/dead-ссылок (Sidebar, Topbar,
  Settings, Admin, Documents) — других проблем не найдено; единственный
  оставшийся "Tezliklə" (Pasiyent məlumat forması) — осознанный
  coming-soon, корректно оформлен, не трогали.
- schema.prisma **не менялась**.

## 7.2. Сессия 19 — итоги (Documents Clinical Polish v1)

Polish-сессия модуля Sənədlər, без новых модулей и без изменения schema
(`toothRecordId`/`treatmentItemId` в `documents` уже существовали):
- Форма загрузки: опциональные select'ы «Dişlə əlaqələndir» /
  «Müalicə ilə əlaqələndir» (опции — только зубы/процедуры пациента,
  patient+tenant scope).
- Server-side проверка владения привязки (чужой зуб/процедура → ошибка).
- Бейджи «Diş N» / «Müalicə: …» в `/documents`, `/patients/[id]/documents`,
  PatientDocumentsBlock.
- ToothPanel (dental-chart) и `/treatments/[id]/materials` показывают
  привязанные документы.
- Превью изображений (`<img>`) в списках документов через существующий
  download route.
- `scripts/cleanup-deleted-documents.ts` — dry-run/--execute, только
  физические файлы soft-deleted `documents`.
- **Найден и исправлен production-баг** (с сессии 14): загрузка файла
  пациентом без зубов/процедур падала с `patientNotFound`, т.к.
  ненарисованный `<select>` не отправляет поле и `formData.get()` возвращал
  `null`, что валился на zod-схеме. Исправлено в
  `lib/validation/documents.ts` (`z.preprocess`).
- Новый e2e: `scripts/e2e-document-clinical-links-check.ts` — 19/19.
- Регрессия: `e2e-file-uploads-check` 39/39, `e2e-documents-check` 36/36,
  `e2e-dental-chart-check` 23/23, `e2e-treatments-check` 31/31,
  `e2e-patients-check` 22/22, `e2e-global-search-check` 22/22,
  `e2e-demo-flow-check` 10/10 — все зелёные.
- Новые permissions не добавлялись (переиспользованы `documents.view`/`documents.manage`).

## 7.3. Сессия 20 — итоги (Deployment Readiness / Production Setup)

Техническая подготовка к self-hosted/VPS деплою, без новых модулей,
без изменения schema.prisma и без изменений бизнес-логики:
- `.env.example` дополнен production-комментариями (dev vs prod значения,
  `openssl rand -base64 32` для `SESSION_SECRET`, обязательное
  `AUTH_MOCK=false` в проде) — новые переменные не добавлялись (всё, что
  читает код, уже было покрыто).
- Создан `docs/DEPLOYMENT.md`: целевая платформа (VPS, не serverless —
  из-за локального `uploads/`), требования к серверу, команды первого
  деплоя (`prisma migrate deploy` → `prisma generate` → `build` → `start`),
  обновление деплоя, backup/restore (Postgres + `uploads/` + `.env`,
  порядок восстановления), известные ограничения, полезные команды.
- Добавлен `app/api/health/route.ts` — `GET /api/health` →
  `{ "ok": true, "service": "dental-pro-crm" }`, без авторизации, без
  обращения к БД (статичный, чтобы не давать false-positive restart при
  временной недоступности Postgres).
- `middleware.ts`: добавлено явное исключение для `/api/health` (пропускает
  без проверки сессии) — без этого неавторизованный запрос получал бы
  редирект на `/login` вместо JSON, что сломало бы health check для
  reverse proxy/process manager. Найдено и исправлено при проверке роута
  через `curl` (preview-браузер маскировал проблему — там уже была сессия).
- `scripts/e2e-demo-flow-check.ts`: добавлена проверка №11 —
  `/api/health` отдаёт `200 {ok:true}` без авторизации (11/11 passed).
- `docs/DEMO.md` §4: убрана устаревшая строка про отсутствие UI привязки
  документа к зубу/процедуре (реализовано в сессии 19); добавлена ссылка
  на DEPLOYMENT.md.
- schema.prisma **не менялась**.

## 7.4. Сессия 21 — итоги (Free Public Demo Deploy Preparation)

Подготовка к бесплатному Vercel + Neon demo-деплою, без новых CRM-модулей
и без изменений schema.prisma:

- **`components/auth/LoginForm.tsx`**: `type="email"` → `type="text"`,
  `autoComplete="email"` → `autoComplete="username"` — чтобы браузер
  не блокировал ввод "admin" как невалидный email.
- **`lib/actions/auth.ts`**: добавлен словарь `LOGIN_ALIASES`
  (`admin` → `admin@demo.dentalpro.az`). Если пользователь вводит строку без
  "@", сервер проверяет alias-карту и подставляет полный email. Обычный
  email-вход `admin@demo.dentalpro.az` не затронут.
- **`prisma/seed.ts`**: дефолт DEMO_PASSWORD изменён с `Demo1234!` → `admin123`.
  При свежей инициализации (Neon/Vercel) пароль будет `admin123`.
  Существующие локальные БД не меняются (upsert не обновляет passwordHash).
- **`package.json`**: добавлен `"postinstall": "prisma generate"` —
  Vercel запускает `npm install`, который через postinstall генерирует
  Prisma Client. Без этого build падал бы с «Can't find module @prisma/client».
  Добавлен скрипт `"demo:deploy:init"` — одна команда для инициализации
  Neon БД (`migrate deploy` + `generate` + `db:seed`).
- **`.env.example`**: обновлён под Vercel/Neon:
  - `AUTH_MOCK=false` (не `"true"`)
  - `SEED_DEMO_PASSWORD=admin123`
  - добавлена `NEXT_PUBLIC_DEMO_MODE=false` (включить в Vercel для demo-подсказки)
  - DATABASE_URL — комментарий с форматом Neon direct connection string
- **`app/login/page.tsx`**: логика подсказки переключена на
  `NEXT_PUBLIC_DEMO_MODE === "true"`. Новый вид: компактный блок
  "Demo giriş / admin / admin123" вместо списка всех demo-email.
  Старый `AUTH_MOCK`-блок и неиспользуемые импорты удалены.
- **`docs/FREE_DEMO_DEPLOY.md`**: новый файл — пошаговая инструкция
  Neon (создать проект, скопировать direct connection string) → `demo:deploy:init`
  → Vercel (import, env vars, deploy) → проверка → ограничение uploads (§9).
- **`docs/DEPLOYMENT.md`**: обновлён заголовок (v1.1), добавлены ссылка на
  FREE_DEMO_DEPLOY.md и §9 «Бесплатный публичный demo-деплой»; уточнены
  комментарии к шагам с `npm install` и `prisma generate`.
- schema.prisma **не менялась**.

Алиас проверен вручную: `admin` / `Demo1234!` (локальная БД) → 303 /dashboard →
dp_session установлен → /dashboard HTTP 200. Email-вход и все e2e не затронуты.

## 7.5. Сессия 22 — итоги (Treatment Protocols & Follow-up Scheduling)

Новый модуль поверх существующего Müalicə (schema изменилась — новая миграция):

- **Новые модели**: `TreatmentProtocol`, `TreatmentProtocolStep` (в `TENANT_MODELS`).
  Миграция: `20260616163350_add_treatment_protocols`.
- **seed**: 3 demo-протокола (Sadə dolğu 2 шага, Kanal müalicəsi protokolu 3 шага,
  Profilaktik müayinə 2 шага) — идемпотентно.
- **`lib/protocols.ts`**: `listProtocols`, `listActiveProtocols`, `getProtocolForClinic`,
  `findAvailableAppointmentSlots` (рабочие часы из setting, 15-мин сетка, 1 DB-запрос).
- **`lib/actions/protocols.ts`**: 7 server actions — `createProtocol`,
  `toggleProtocolActive`, `deleteProtocol`, `addProtocolStep`, `deleteProtocolStep`,
  `applyProtocol` (создаёт TreatmentItems + recalcPlanTotal + audit),
  `scheduleFollowUp` (создаёт Appointment + линкует TreatmentItem.appointmentId + audit).
- **`/settings/protocols`**: управление протоколами (view/manage). Ссылка
  добавлена на `/settings`.
- **`ApplyProtocolForm`** (`components/protocols/`): под каждым активным планом
  на `/patients/[id]/treatments` — выбрать протокол → создать шаги-TreatmentItem.
- **`FollowUpScheduleForm`** + **`/treatments/[id]/followup`**: кнопка CalendarPlus
  на planned/in_progress items без appointmentId → страница с слот-подсказками и формой.
- **`TreatmentItemCard`**: иконка `CalendarPlus` → `/treatments/[id]/followup`
  для `planned`/`in_progress` items без appointmentId.
- **`e2e-treatment-protocols-check.ts`**: 31/31.
- **`docs/TREATMENT_PROTOCOLS.md`**: новый профиль-doc.
- Все существующие e2e зелёные после изменений.

Известные ограничения сессии 22:
- `intervalDays` в шагах протокола хранится, но не используется для автоматической
  нумерации дат follow-up (предложены слоты `findAvailableAppointmentSlots`,
  но дата определяется пользователем, не вычисляется автоматически из interval).
- Протоколы — клиники-уровня (нельзя персонализировать на пациента); это MVP.

## 7.8. Сессия 25 — итоги (Doctor & Assistant Assignment v1)

Добавлен UI и server actions для управления связями «Məsul həkim» и «Həkim–Assistent».
Schema **не менялась** — все поля (`Patient.primaryDoctorId`, `Assistant.assignedDoctorId`,
`Doctor.assistants`) уже существовали. Migration не выполнялась.

**Новые server actions** (`lib/actions/admin.ts`):
- `assignPatientDoctor` — назначение/снятие ответственного врача у пациента
- `assignDoctorAssistant` — привязка ассистента к врачу (идемпотентно)
- `removeAssistantLink` — отвязка ассистента от врача (идемпотентно)

**Исправлен gap**: `createStaffUser` и `changeStaffRole` теперь делают upsert
Doctor/Assistant профиля при назначении роли `doctor`/`assistant`. Ранее профиль
не создавался автоматически.

**Новые компоненты**:
- `components/patients/AssignDoctorForm.tsx` — inline select на карточке пациента
- `components/admin/DoctorAssistantsCard.tsx` — карточка врач–ассистент в /admin

**Обновлён `/admin`**: карточка «Həkim–Assistent bağlantıları» с assign/remove
формами для каждого активного врача клиники.

**Обновлена `/patients/[id]`**: строка «Məsul həkim» стала интерактивной
для `admin.manage` (inline select + save).

**Новые вспомогательные функции** (`lib/admin.ts`):
`listDoctorsForAdmin`, `listAssistantUsersForAdmin` (с linkedAssistants/linkedDoctorUserId).

**Новые Zod-схемы** (`lib/validation/admin.ts`):
`assignPatientDoctorSchema`, `assignDoctorAssistantSchema`, `removeAssistantLinkSchema`.

**i18n** (`i18n/az.ts`): `admin.assignment.*`, `admin.errors.crossTenant*/notFound*`.

**E2E**: `scripts/e2e-doctor-assistant-assignment-check.ts` — 28/28.
Все 7 существующих e2e-сьютов зелёные (198 проверок).

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.

Известные ограничения:
- Изменение `assignedDoctorId` в БД вступает в силу при **следующем логине**
  ассистента (JWT TTL 12 ч) — не в рамках текущей сессии.
- `notFound()` в Next.js 15 dev возвращает HTTP 200 (не 404); e2e-тесты
  проверяют отсутствие контента (не статус).

## 7.10. Сессия 27 — итоги (Platform Owner via Env Vars)

Персональный платформенный доступ без хардкода учётных данных в коде/docs.
Schema **не менялась**. Migration не выполнялась.

**`prisma/seed.ts`**: блок upsert platform owner — если `PLATFORM_OWNER_EMAIL` и
`PLATFORM_OWNER_PASSWORD` заданы в `.env`, `prisma.user.upsert` создаёт/обновляет
`super_admin`-пользователя с хэшированным паролем и `clinicId: null`.

**`lib/actions/auth.ts`**: функция `resolveLoginEmail` заменила inline-тернарное
выражение. Теперь: сначала static `LOGIN_ALIASES`, затем `PLATFORM_OWNER_LOGIN` →
`PLATFORM_OWNER_EMAIL` из env (runtime, без пересборки). Email-вход без алиасов
не затронут.

**`.env.example`**: добавлены 4 placeholder-строки (`PLATFORM_OWNER_LOGIN/EMAIL/PASSWORD/NAME`)
с комментарием — закомментированы, реальные значения не хардкодятся.

**`docs/PLATFORM_ADMIN.md`**: добавлен раздел «Персональный платформенный владелец»
с описанием env vars, seed-логики, входа через алиас, замечаниями по безопасности.

**`docs/DEMO.md`**: исправлен пароль demo-аккаунтов — `admin123` (дефолт для свежей БД),
убрана ссылка на устаревший `Demo1234!`.

**`scripts/e2e-platform-admin-check.ts`**: добавлена проверка **19** (conditional):
если `PLATFORM_OWNER_LOGIN/EMAIL/PASSWORD` заданы в env — тест проверяет вход через
алиас и доступ к `/dashboard` и `/platform/clinics`. Если env не задан — checks пропускаются
с пояснением в консоли. Не ломает запуск без env vars.

`npx tsc --noEmit` → 0 ошибок. Все существующие e2e не затронуты (210/210 зелёных).

## 7.9. Сессия 26 — итоги (Doctor Transfer v1)

Добавлен bulk-transfer врача: форма в `/admin`, server action, preview-хелпер.
Schema **не менялась** — все поля существовали. Migration не выполнялась.

**Новый server action** `transferDoctor` (`lib/actions/admin.ts`):
- `prisma.$transaction(async tx => {...})` — атомарный bulk-update
- `Patient.primaryDoctorId` (если `transferPatients=true`)
- `Appointment.doctorId` (если `transferAppointments=true`, только `status ∈ {scheduled,notified,confirmed,reschedule_requested}` и `startsAt >= now`)
- Guards: `sameDoctor`, `nothingSelected`, cross-tenant (both doctors looked up with `clinicId`)
- Один `audit_log` на transfer

**Новый helper** `getDoctorTransferPreview` (`lib/admin.ts`):
- Два `prisma.count` в `Promise.all`; отображает цифры под select'ами в форме

**Обновлён `DoctorForAdmin`**: добавлено поле `doctorId: string` (Doctor.id)

**Новый компонент** `DoctorTransferForm` (`components/admin/DoctorTransferForm.tsx`):
- `"use client"`, `useActionState`
- Два select с preview-строкой (patron через `useState`, без серверного запроса)
- Атрибут `data-e2e-doctor-transfer` на форме

**Обновлён `/admin` page**: preview загружается в `Promise.all`; карточка рендерится при `doctors.length >= 2`

**Новая Zod-схема** `transferDoctorSchema` + `patientsMoved/appointmentsMoved` в `AdminFormState`

**i18n** (`i18n/az.ts`): `admin.transfer.*`, `admin.errors.sameDoctor`, `admin.errors.nothingSelected`

**E2E**: `scripts/e2e-doctor-transfer-check.ts` — 12/12.
Все 8 существующих e2e-сьютов зелёные (198 проверок + 12 новых = 210 всего).

`npx tsc --noEmit` → 0 ошибок.

Известные ограничения (задокументированы в `docs/DOCTOR_TRANSFER.md`):
- `Assistant.assignedDoctorId` НЕ обновляется при transfer — ручное переназначение
  через «Həkim–Assistent bağlantıları» карточку в /admin
- `TreatmentItem.doctorId`, `TreatmentPlan.doctorId`, `ToothRecord.doctorId` — историческая запись, не меняется
- `arrived`/`in_progress`/`running_late` приёмы не переносятся (опасно в v1)
- Нет undo/rollback — обратный transfer вручную через ту же форму

## 7.7. Сессия 24 — итоги (Super Admin Clinic & User Management v1)

Новый платформенный модуль `super_admin` поверх существующего Admin v1.
Schema изменилась (новая миграция `20260616201010_add_clinic_type`):

- **`ClinicType` enum**: `clinic | solo_doctor` + поле `clinicType` в `Clinic`
  (`@default(clinic)`).
- **`super@demo.dentalpro.az`**: новый пользователь `super_admin` в seed.
  Алиас `super` → `super@demo.dentalpro.az` в `LOGIN_ALIASES`.
- **Suspended clinic блокирует логин**: `lib/actions/auth.ts` проверяет
  `user.clinic?.status === "suspended"` → `{ error: "clinicSuspended" }`;
  `LoginForm` показывает отдельный текст "Klinika müvəqqəti dayandırılıb."
- **`lib/platform.ts`**: `listClinics()` / `getClinicDetail()` — кросс-клиничные
  запросы через `prisma` (не tenantClient).
- **`lib/actions/platform.ts`**: 6 server actions — `createClinic`,
  `setClinicStatus`, `platformCreateUser`, `platformResetPassword`,
  `platformChangeLogin`, `platformToggleUserStatus`. Все — `requireRole("super_admin")`.
- **`/platform/clinics`** и **`/platform/clinics/[id]`**: новые страницы.
  Компоненты: `ClinicListTable`, `CreateClinicForm`, `ClinicStatusControl`,
  `CreateClinicUserForm`, `ClinicUserList` (с inline формами reset/change/toggle).
- **`platform`** добавлен в `MODULES`; `platform.view`+`platform.manage` →
  super_admin. Sidebar: иконка `Building2` (Lucide).
- **`lib/actions/admin.ts`**: добавлены `resetStaffPassword`, `changeStaffLogin`
  — clinic admin может сбрасывать пароль / менять email сотрудников своей клиники
  (scope: clinicId из сессии, нельзя трогать super_admin).
- **`components/admin/StaffTable.tsx`**: новые inline формы «Şifrəni sıfırla»
  и «Giriş e-poçtunu dəyiş» в каждой строке сотрудника.
- **`lib/validation/platform.ts`**: схемы + `PlatformFormState`.
- **`lib/validation/admin.ts`**: добавлены `resetPasswordSchema`, `changeLoginSchema`.
- **`i18n/az.ts`**: добавлены `auth.clinicSuspended`, `admin.passwordReset`,
  `admin.loginChange`, полный раздел `platform.*`.
- **`scripts/e2e-platform-admin-check.ts`**: 42/42 (18 проверок × ~2.3 sub-checks).
- Регрессия: `e2e-admin-check` 36/36, `e2e-demo-flow-check` 11/11,
  `e2e-patients-check` 22/22, `e2e-appointments-check` 28/28 — все зелёные.
- `npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (39 routes).

Известные ограничения сессии 24:
- Инвалидация JWT-сессий при смене пароля/логина/suspended не реализована
  (server-side session store — out of scope).
- Нет pagination для `/platform/clinics` и `/platform/clinics/[id]`.
- Клинику нельзя удалить через UI (только через БД).

## 7.11. Сессия 32 — итоги (Inventory Unit Conversions v1)

Добавлены поля конвертации единиц к `InventoryItem`. Backwards-compatible: существующие
материалы не требуют изменений, `quantity` по-прежнему хранится в базовой единице.

**Изменения:**
- **Migration** `20260617150000_add_inventory_unit_conversions`: три новых колонки:
  `purchase_unit TEXT`, `purchase_to_base_factor DECIMAL(12,4) DEFAULT 1`,
  `dose_to_base_factor DECIMAL(12,4)` — все nullable/с дефолтом.
- **`prisma/schema.prisma`**: `purchaseUnit String?`, `purchaseToBaseFactor Decimal @default(1)`,
  `doseToBaseFactor Decimal?` добавлены в `InventoryItem`.
- **`lib/validation/inventory.ts`**: добавлены `decimalFactor` (>0, empty→1) и
  `optionalFactor` (>0 или null); `inventoryItemSchema` расширен тремя полями;
  ошибка `factorInvalid` — реджект нуля и отрицательных значений.
- **`lib/actions/inventory.ts`**: `createInventoryItem` сохраняет три новых поля.
- **`i18n/az.ts`**: ключи `inventory.form.purchaseUnit/purchaseToBaseFactor/doseToBaseFactor/...`,
  `inventory.item.purchaseUnit/purchaseConversion/doseConversion`,
  `inventory.errors.factorInvalid`.
- **`components/inventory/InventoryItemForm.tsx`**: секция «Vahid çevrilməsi» с тремя полями
  (purchaseUnit, purchaseToBaseFactor defaultValue="1", doseToBaseFactor optional).
- **`app/(dashboard)/inventory/[id]/page.tsx`**: InfoRow'ы конвертации (только если
  `purchaseUnit` или `doseToBaseFactor` заданы).
- **`scripts/e2e-inventory-units-check.ts`** (27 checks): auth guard, permission guard,
  baseUnit "ml", purchaseUnit "qutu"+factor 50, doseToBaseFactor 2, factor=0 rejected,
  factor=-5 rejected, corrections compat, tenant isolation.
- **`package.json`**: добавлен скрипт `e2e-inventory-units-check`.
- **`docs/INVENTORY_UNITS.md`**: новый profile-doc.

**Не реализовано (out of scope):** dispensingUnit, отдельная модель Unit, шаблоны
списания на процедуру, auto-deduction по doseToBaseFactor, cost-reports по дозе,
конвертация в форме supplier receiving.

**E2E (все 9 суит зелёные после сессии):**
`e2e-inventory-units-check` 27/27, `e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33, `e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38, `e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42, `e2e-demo-flow-check` 11/11.

## 7.12. Сессия 33 — итоги (Service Consumable Templates v1)

Добавлена модель шаблонов расходников для услуг. **Template only** — stock не списывается.
Фактическое списание при лечении — Session 34.

**Изменения:**
- **Migration** `20260617160000_add_service_consumable_templates`: новая таблица
  `service_consumable_templates` (uuid PK, clinicId FK, serviceId FK CASCADE, inventoryItemId FK RESTRICT,
  quantity DECIMAL(12,3), unit TEXT, allow_override BOOL, is_required BOOL, note TEXT?).
  Unique constraint `(clinicId, serviceId, inventoryItemId)`.
- **`prisma/schema.prisma`**: модель `ServiceConsumableTemplate` + back-relations на `Service`,
  `InventoryItem`, `Clinic`. `ServiceConsumableTemplate` добавлена в `TENANT_MODELS` (lib/tenant.ts).
- **`lib/validation/service-consumables.ts`**: `createConsumableTemplateSchema`,
  `updateConsumableTemplateSchema`, `deleteConsumableTemplateSchema`, `ServiceConsumableFormState`.
- **`lib/service-consumables.ts`**: `listServiceConsumableTemplates`, `listInventoryItemsForConsumable`.
- **`lib/actions/service-consumables.ts`**: три server actions — `createConsumableTemplate`,
  `updateConsumableTemplate`, `deleteConsumableTemplate`. Все требуют `settings.manage`.
  Super admin (`clinicId=null`) → `{ error: "unauthorized" }`.
- **Unit validation**: `unit = "dose"` разрешён только если `item.doseToBaseFactor` задан (Session 32).
- **`i18n/az.ts`**: `settings.services.consumablesPage.*` + новые ключи в `settings.errors`.
- **`components/settings/ServiceConsumableAddForm.tsx`**: client component, add-форма с item select
  (показывает doseToBaseFactor hint), dynamic unit options, checkboxes.
- **`components/settings/ServiceConsumablesList.tsx`**: client component, список шаблонов как
  inline edit-форм (update + delete с confirm).
- **`components/settings/ServicesTable.tsx`**: добавлена ссылка «Sərfiyyatlar» per service row.
- **`app/(dashboard)/settings/services/[id]/page.tsx`**: новая RSC-страница, route `/settings/services/[id]`.
- **`scripts/e2e-service-consumable-templates-check.ts`** (30 checks): auth, permission, create,
  duplicate protection, update, dose validation, qty validation, tenant isolation, super admin safety, delete, regression.
- **`package.json`**: добавлен `e2e-service-consumable-templates-check`; добавлены все остальные
  e2e-скрипты как npm-скрипты (inventory-check, supplier-*, admin-*, platform-admin-*, demo-flow-*).
- **`docs/SERVICE_CONSUMABLE_TEMPLATES.md`**: новый profile-doc.

**Не реализовано (out of scope):**
- Session 34 — автоматическое списание со склада при лечении ✅ (реализовано в S34)
- Session 35 — cost reports по расходникам

**E2E (все 10 суит зелёные после сессии):**
`e2e-service-consumable-templates-check` 30/30, `e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34, `e2e-inventory-check` 33/33,
`e2e-supplier-receiving-check` 27/27, `e2e-supplier-orders-check` 38/38,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42, `e2e-demo-flow-check` 11/11.

## 7.13. Сессия 34 — итоги (Treatment Consumable Usage v1)

Фактическое списание расходников по шаблонам при лечении.

**Изменения:**
- **Migration** `20260618120000_add_treatment_consumable_usage`:
  - Новый enum value `treatment_usage` в `MovementType`
  - Новая таблица `treatment_consumable_usages` (uuid PK, clinicId FK CASCADE, treatmentItemId FK CASCADE,
    inventoryItemId FK RESTRICT, templateId FK SET NULL, quantity DECIMAL(12,3), unit TEXT,
    baseQuantity DECIMAL(12,3), baseUnit TEXT, allowOverride BOOL, isRequired BOOL, wasSkipped BOOL,
    note TEXT?, inventoryMovementId UNIQUE FK SET NULL, createdById UUID, Timestamptz).
- **`prisma/schema.prisma`**: `TreatmentConsumableUsage` model + back-relations на `Clinic`,
  `TreatmentItem`, `InventoryItem`, `ServiceConsumableTemplate`, `InventoryMovement`.
  `TreatmentConsumableUsage` добавлена в `TENANT_MODELS`.
- **`lib/validation/treatment-consumables.ts`**: `consumableUsageItemSchema`, `applyConsumablesSchema`, `ConsumableUsageFormState`.
- **`lib/treatment-consumables.ts`**: `getConsumableTemplatesForService`, `getConsumableUsagesForTreatment`, `calculateBaseQuantity` helper.
- **`lib/actions/treatment-consumables.ts`**: `applyTreatmentConsumablesAction` — bulk apply с advisory lock, transaction, double-apply protection.
- **`i18n/az.ts`**: `treatments.consumables.*` + error keys в `treatments.errors`.
- **`components/treatments/TreatmentConsumableChecklist.tsx`**: client component, checklist форм с qty override, skip optional, stock warning.
- **`app/(dashboard)/treatments/[id]/consumables/page.tsx`**: новая RSC-страница, route `/treatments/[id]/consumables`.
- **`components/treatments/TreatmentItemCard.tsx`**: иконка `FlaskConical` → consumables link.
- **`components/treatments/TreatmentItemsList.tsx`**: добавлен `consumablesLabel` prop.
- **`app/(dashboard)/treatments/page.tsx`** + **`patients/[id]/treatments/page.tsx`**: передают `consumablesLabel`.
- **`scripts/e2e-treatment-consumable-usage-check.ts`**: E2E чек-скрипт.
- **`package.json`**: добавлен `e2e-treatment-consumable-usage-check`.
- **`docs/TREATMENT_CONSUMABLE_USAGE.md`**: новый profile-doc.

**Не реализовано (out of scope):**
- Session 35 — cost reports по расходникам ✅ (реализовано в S35)
- Session 36 — profitability analytics per doctor
- Автоматический reorder поставщику при low-stock

**E2E (все 11 суит после сессии — run после dev server start):**
`e2e-treatment-consumable-usage-check` 38/38, `e2e-service-consumable-templates-check` 30/30,
`e2e-inventory-units-check` 27/27, `e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33, `e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38, `e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42, `e2e-demo-flow-check` 11/11.

## 7.14. Сессия 35 — итоги (Consumable Cost Reports v1)

Read-only отчёт по фактически использованным расходникам и базовой себестоимости.

**Изменения:**
- **Нет migration** (чистый read-only модуль поверх Session 34 данных).
- **`lib/consumable-cost-reports.ts`**: `getConsumableCostSummary`, `getConsumableCostByInventoryItem`,
  `getConsumableCostByService`, `getConsumableCostByDoctor`, `getRecentConsumableUsages`.
  Правило: `cost = round(baseQuantity × InventoryItem.unitCost)`; null unitCost → 0 + флаг.
  Фильтры: dateFrom/dateTo/doctorId/serviceId/inventoryItemId/patientId. clinicId из сессии.
- **`app/(dashboard)/reports/consumables/page.tsx`**: RSC-страница `/reports/consumables`.
  Permission: `inventory.view`. Фильтр-форма (HTML GET, без JS). Секции: summary cards,
  by item, by service, by doctor, recent usages (50 строк).
- **`i18n/az.ts`**: новая top-level секция `reports.consumables.*` (50+ ключей AZ).
- **`app/(dashboard)/inventory/page.tsx`**: добавлена ссылка «Sərfiyyat hesabatı» (BarChart3 icon)
  в header actions, `data-e2e-marker="consumable-report-link"`.
- **`scripts/e2e-consumable-cost-reports-check.ts`**: E2E чек-скрипт (секции A–L).
- **`package.json`**: добавлен `e2e-consumable-cost-reports-check`.
- **`docs/CONSUMABLE_COST_REPORTS.md`**: новый profile-doc.

**Cost rules:**
- Источник: `TreatmentConsumableUsage` (wasSkipped=false, inventoryMovementId IS NOT NULL)
- cost = `round(baseQuantity × InventoryItem.unitCost)` гяпики
- null unitCost → cost=0, UI показывает "Qiymət yoxdur"
- v1 использует текущий `unitCost` — исторический снимок на момент списания не реализован (future)

**Не реализовано (out of scope):**
- Session 36 — profitability analytics per doctor
- Payroll / зарплаты врачей
- Excel/PDF экспорт
- Исторический снимок unitCost на момент списания
- Автоматический reorder поставщику при low-stock

**E2E (все 12 суит после сессии — run после dev server start):**
`e2e-consumable-cost-reports-check`, `e2e-treatment-consumable-usage-check` 38/38,
`e2e-service-consumable-templates-check` 30/30, `e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34, `e2e-inventory-check` 33/33,
`e2e-supplier-receiving-check` 27/27, `e2e-supplier-orders-check` 38/38,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42, `e2e-demo-flow-check` 11/11.

## 7.20. Сессия 41 — итоги (Patient Response Link Foundation v1)

Foundation для безлогинного ответа пациента на напоминание о приёме. **Без миграции**
(`PatientResponseLink` существовал в схеме с `init`, не использовался). **WhatsApp остаётся
только click-to-chat — без API, без автоотправки.**

**Изменения:**
- **`lib/patient-response.ts`** (new): `generateResponseToken` (256-бит crypto-random,
  base64url), `buildPatientResponseUrl` (NEXT_PUBLIC_APP_URL → иначе request headers),
  `getOrCreateAppointmentResponseLink` (reuse активной непросроченной ссылки / создать новую,
  TTL 48ч), `getPublicResponseLinkState` (публичное чтение по токену, минимум данных).
- **`lib/validation/patient-response.ts`** (new): `submitPatientResponseSchema`,
  `RESPONSE_TYPES`, `PatientResponseFormState`.
- **`lib/actions/patient-response.ts`** (new): `submitPatientResponseAction` — public, без
  сессии; scoping только из записи по token; single-use через атомарный
  `updateMany(status active→used)`; обновляет приём (`RESPONSE_TO_STATUS`: confirm→confirmed,
  running_late→running_late, reschedule_request→reschedule_requested, cancel→cancelled),
  пишет историю пациента (`channel=other`) + staff-уведомление (`channel=in_app`,
  `userId=null`, `status=pending`).
- **`app/r/[token]/page.tsx`** (new) + **`components/patient-response/PatientResponseForm.tsx`**
  (new): публичная страница вне `(dashboard)`-группы, 4 кнопки-ответа, предупреждение про 15
  минут, опциональный комментарий, состояния active/used/expired.
- **`middleware.ts`**: bypass для `/r` и `/r/...` (не через `PUBLIC_PATHS`, чтобы не
  редиректить залогиненного сотрудника на /dashboard).
- **`lib/communications.ts`**: `appointmentReminderMessage` + опциональные
  `doctorName`/`responseUrl` (старые вызовы не сломаны).
- **`lib/actions/communications.ts`**: `prepareAppointmentReminder` создаёт/переиспользует
  ссылку и вставляет её в текст напоминания.
- **`i18n/az.ts`**: секция `patientResponse.*`.
- **`.env.example`**: опциональный `NEXT_PUBLIC_APP_URL` (документирован как fallback).
- **docs**: new `PATIENT_RESPONSE_LINKS.md`; обновлены `COMMUNICATIONS.md`,
  `NOTIFICATIONS.md`, этот файл.
- **`scripts/e2e-patient-response-links-check.ts`** (new, 42 проверки) + npm-скрипт.

**Соответствие статусов:** `ResponseType` (confirm/cancel) ≠ `AppointmentStatus`
(confirmed/cancelled) — маппинг `RESPONSE_TO_STATUS`; `Appointment.status` и кэш
`patientResponseStatus` получают одно и то же знач-статус. UI приёмов отражает это через
существующие `APPOINTMENT_STATUS_META` + `AppointmentStatusBadge` (новый «response badge» не
вводился — статусы уже были в enum).

**Замечание по тесту:** `e2e-communications-check.ts` держит локальную standalone-копию
`appointmentReminderMessage` (4-арг) для unit-level assert — намеренно не синхронизирована
с расширенной версией (проверка вставки ссылки покрыта новым `e2e-patient-response-links-check`).
При прогоне 7 «падений» communications оказались **seed-staleness** (demo-приёмы устарели из
окна today/tomorrow панели напоминаний) — после `npm run db:seed` → 40/40 зелёные, не
регрессия Session 41.

**E2E (после сессии):** `e2e-patient-response-links-check` 42/42, `e2e-communications-check`
40/40, `e2e-appointments-check` 28/28, `e2e-notifications-check` 17/17, `e2e-demo-flow-check`
11/11, `e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (`/r/[token]` присутствует).

**Не реализовано (по scope):** WhatsApp Business API, автоотправка, выбор слота пациентом
(Session 43), feedback flow, 6-month recall, scheduler/cron, rate limiting публичного роута.

## 7.19. Сессия 40 — итоги (Supplier Order Draft Approval Flow v1)

Добавлен явный approval flow для черновиков supplier order. Минимальная additive миграция
(один enum value). **Без авто-отправки, без receiving, без stock-мутации, без InventoryMovement.**

**Изменения:**
- **Migration** `20260619000000_add_supplier_order_approved_status`: единственная строка
  `ALTER TYPE "SupplierOrderStatus" ADD VALUE 'approved';`. Создана вручную (не через
  `prisma migrate dev`, который упал на shadow-database из-за pre-existing drift в более
  ранней миграции `20260618100805_add_consumable_reversal` — не связано с этой сессией) и
  применена через `prisma migrate deploy`.
- **`prisma/schema.prisma`**: `SupplierOrderStatus` получил `approved` между `draft` и `sent`.
- **`lib/actions/supplier-orders.ts`**:
  - Новый `confirmSupplierOrderDraftAction` — draft→approved, требует ≥1 позиции, пишет
    `orderedAt` (существовавшее, но никогда не использовавшееся поле), audit log.
    Permission: `inventory.manage` (без новой permission). Super admin → `unauthorized`.
  - `markSupplierOrderSent`: precondition расширен с `status !== "draft"` до
    `status !== "draft" && status !== "approved"` — подтверждение остаётся опциональным,
    прямой draft→sent путь не ломается (важно для регрессии `e2e-supplier-orders-check`).
- **`lib/actions/supplier-receiving.ts`**: добавлена явная ранняя проверка
  `if (orderItem.order.status === "draft") throw new ReceivingError("orderApprovalRequired")`
  — более понятное сообщение для конкретно draft-случая (receiving для draft был уже
  заблокирован раньше через `status !== "received"`, это не новый guard, а более ясный текст).
- **`components/supplier-orders/OrderStatusActions.tsx`**: новая ветка для `draft` — кнопка
  «Sifarişi təsdiqlə» + success-сообщение + заметка «Avtomatik göndərilmir», **plus**
  существующие mark-sent/cancel формы (оставлены для обратной совместимости — e2e уже
  проверял их видимость на draft). Новая ветка для `approved` — mark-sent + cancel (без
  confirm-кнопки).
- **`components/supplier-orders/OrderDetailCard.tsx`**: explanatory note для draft
  («Bu sifariş hələ təsdiqlənməyib və avtomatik göndərilmir.»), статус-badge для `approved`
  («Təsdiqlənib»), новая строка `orderedAt` («Təsdiq tarixi»).
- **`components/supplier-orders/SupplierOrdersList.tsx`**: добавлен цвет для `approved` в
  status-карту — список заказов уже был generic, других изменений не требовалось.
- **`i18n/az.ts`**: `supplierOrders.approval.*`, `supplierOrders.orderedAt`,
  `supplierOrders.statuses.approved`, новые error keys `confirmEmpty`/`orderApprovalRequired`.
- **`scripts/e2e-supplier-order-draft-approval-check.ts`**: 31 проверка (секции A–J).
- **`package.json`**: добавлен `e2e-supplier-order-draft-approval-check`.
- **docs**: новый `SUPPLIER_ORDER_DRAFT_APPROVAL.md`; обновлены `SUPPLIER_ORDERS.md`,
  `LOW_STOCK_REORDER_DRAFTS.md`, `SESSION_HANDOFF.md`.

**Совместимость:** items становятся read-only после approval (existing `isDraft`-гейт в
`OrderItemsTable`/`AddCatalogItemForm` не трогался — `approved` просто не входит в этот гейт,
сознательный выбор, не требующий кода). Low-stock-созданные draft'ы (Session 39) — обычные
`status: "draft"` заказы, подтверждаются тем же flow без какого-либо специального кейса.

**Найдено при regression-прогоне** (не баг этой сессии): `e2e-consumable-cost-reports-check`
кратковременно падал на чеке "today filter" — тест вычисляет "сегодня" через
`new Date().toISOString()` (UTC), а сервер парсит `dateTo` как local-time; в окне
00:00–04:00 по Asia/Baku (UTC+4) даты расходятся на день. Подтверждено запуском теста и
dev-сервера под `TZ=UTC` — без расхождения тест проходит 30/30. Это pre-existing проблема
теста сессии 35, не относящаяся к Session 40 — файл не трогался, отчёт зафиксирован как
известное ограничение, а не исправлен (вне scope этой сессии).

**Не реализовано (out of scope по заданию сессии):**
- Автоматическая отправка email/WhatsApp при confirm или при send
- Платёжная автоматизация
- Автоматическое receiving
- Supplier automation / AI-прогнозирование

**E2E (все 17 суит после сессии):**
`e2e-supplier-order-draft-approval-check` 31/31,
`e2e-low-stock-reorder-drafts-check` 31/31,
`e2e-low-stock-alerts-check` 27/27,
`e2e-supplier-orders-check` 38/38,
`e2e-supplier-receiving-check` 27/27,
`e2e-inventory-check` 33/33,
`e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34,
`e2e-consumables-audit-visibility-check` 28/28,
`e2e-treatment-consumable-reversal-check` 29/29,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-consumable-cost-reports-check` 30/30 (под TZ=UTC, см. выше),
`e2e-service-consumable-templates-check` 30/30,
`e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42,
`e2e-demo-flow-check` 11/11.
Дополнительно (не в package.json): `e2e-dashboard-check` 20/20, `e2e-notifications-check` 17/17.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (49 routes).

---

## 7.18. Сессия 39 — итоги (Supplier Reorder Draft from Low Stock v1)

Добавлена возможность создать черновик(и) supplier order прямо со страницы
`/inventory/alerts`, на основе выбранных пользователем low-stock материалов.
**Без миграции. Без stock-мутации. Без InventoryMovement. Без авто-отправки заказа.**

**Изменения:**
- **`lib/low-stock-reorder.ts`** (новый): `buildReorderDraftPreview(user, itemIds)` —
  clinicId-scoped, группирует выбранные `InventoryItem` по `supplierId`, считает
  reorder-suggestion (переиспользует `calculateReorderSuggestion` из Session 38), относит
  items без supplier в `excludedNoSupplier`.
- **`lib/actions/low-stock-reorder.ts`** (новый, `"use server"`):
  `createSupplierOrderDraftsFromLowStockAction` — парсит `items[N].inventoryItemId/selected/
  quantity` (тот же flat-FormData convention, что и `applyTreatmentConsumablesAction`),
  фильтрует выбранные, группирует по supplier через `buildReorderDraftPreview`, для каждой
  группы: `getOrCreateDraftSupplierOrder` (переиспользован существующий helper из
  `lib/supplier-orders.ts`, ранее не вызывался ниоткуда) → upsert `SupplierOrderItem`
  (merge quantity при повторном совпадении) → пересчёт totalCost. Permission:
  `inventory.manage` (без новой permission). Super admin (`clinicId=null`) → `unauthorized`.
- **`lib/validation/low-stock-reorder.ts`** (новый): `reorderDraftRowSchema`,
  `reorderDraftNoteSchema`, `LowStockReorderActionState`.
- **`components/inventory/ReorderDraftForm.tsx`** (новый, client component): заменил
  inline-таблицу на странице `/inventory/alerts` — та же таблица + чекбокс/qty-колонки
  (только при `canManage`), textarea для заметки, hint при нескольких поставщиках,
  success-панель со ссылками "Sifarişə keç" на созданные заказы.
- **`app/(dashboard)/inventory/alerts/page.tsx`**: передаёт `canManage` +
  `<ReorderDraftForm>` вместо inline-таблицы; все `data-e2e-marker` Session 38 сохранены.
- **`i18n/az.ts`**: новая секция `inventory.alerts.reorderDraft.*`.
- **`scripts/e2e-low-stock-reorder-drafts-check.ts`**: 31 проверка (секции A–J).
- **`package.json`**: добавлен `e2e-low-stock-reorder-drafts-check`.
- **docs**: новый `LOW_STOCK_REORDER_DRAFTS.md`; обновлены `LOW_STOCK_ALERTS.md`,
  `SUPPLIER_ORDERS.md`, `SESSION_HANDOFF.md`.

**Найден и исправлен баг во время сессии** (не относится к бизнес-логике, чисто bundling):
`formatQty` жил в `lib/inventory.ts` (server-only — транзитивно тянет `lib/tenant.ts` →
`lib/auth.ts` → `next/headers`). Перенос таблицы в client component с импортом `formatQty`
оттуда тянул весь server-only граф в client bundle → Next.js dev build падал с 500
("pages/ directory" error) при первой компиляции `/inventory/alerts`. Исправлено: `formatQty`
перенесён в `lib/utils.ts` (уже дом для `formatMoney`/`formatDate`), `lib/inventory.ts`
ре-экспортирует его для существующих server-component call sites (без изменений в них),
`ReorderDraftForm.tsx` импортирует напрямую из `lib/utils.ts`. `lib/actions/supplier-orders.ts`
оставлен **без изменений** (изначально экспортировал `recalcOrderTotal` для переиспользования,
но это оказалось рискованным изменением другого файла — откатано; небольшая дублирующая
логика пересчёта total вместо этого инлайнится в новом action-файле).

**Supplier/inventory совместимость:** `SupplierOrderItem.inventoryItemId` — уже существовавший
nullable FK (Session 30, для receiving); сессия 39 — первая, кто пишет его **на этапе
создания** позиции (раньше заполнялся только при оприходовании). `OrderItemsTable`,
`ReceiveOrderItemForm`, `buildSupplierOrderMessage` рендерят по snapshot-полям — полная
совместимость без изменений в этих файлах (проверено вручную через preview: создан draft,
открыта /inventory/supplier-orders/[id], позиция и WhatsApp-текст корректны).

**Не реализовано (out of scope по заданию сессии):**
- Автоматическая отправка заказа поставщику
- Автоматическое оприходование (receiving — отдельный явный шаг)
- AI-прогнозирование спроса
- Финансовая автоматизация / платежи
- Отдельный preview-wizard перед созданием (v1 использует саму таблицу alerts как preview)

**E2E (все 16 суит после сессии):**
`e2e-low-stock-reorder-drafts-check` 31/31,
`e2e-low-stock-alerts-check` 27/27,
`e2e-consumables-audit-visibility-check` 28/28,
`e2e-treatment-consumable-reversal-check` 29/29,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-consumable-cost-reports-check` 30/30,
`e2e-service-consumable-templates-check` 30/30,
`e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33,
`e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38,
`e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42,
`e2e-demo-flow-check` 11/11.
Дополнительно (не в package.json): `e2e-dashboard-check` 20/20, `e2e-notifications-check` 17/17.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (49 routes).

---

## 7.17. Сессия 38 — итоги (Low Stock Alerts / Reorder Suggestions v1)

Read-only визуализация поверх существующих `quantity`/`minQuantity`/`purchaseUnit`/
`purchaseToBaseFactor` полей. **Нет migration. Нет мутации склада. Нет автоматического
создания supplier order.**

**Изменения:**
- **`lib/low-stock.ts`** (новый файл): `computeAlertStatus(quantity, minQuantity)` —
  4-уровневый статус `out_of_stock > low_stock > warning > ok` (warning-порог =
  `minQuantity × 1.5`, новый по сравнению с существующим `inventoryStatus()` в
  `lib/inventory.ts`); `calculateReorderSuggestion(item)` —
  `suggestedBaseQuantity = max(minQuantity*2-quantity, minQuantity)`,
  `suggestedPurchaseUnits = ceil(suggestedBaseQuantity/purchaseToBaseFactor)` (только если
  `purchaseUnit` задан); `listLowStockAlerts(user, params)` — фильтруемый список (status:
  attention/all/out_of_stock/low_stock/warning, q, categoryId); `getLowStockAlertSummary(user)`
  — счётчики для summary-карточек. Названия функций намеренно отличаются от
  `listLowStockItems`/`getLowStockSummary` из ТЗ — эти имена уже заняты в `lib/inventory.ts`
  с другой сигнатурой.
- **`app/(dashboard)/inventory/alerts/page.tsx`** (новая RSC-страница): summary-карточки
  (Bitib/Az qalıb/Azalır/Diqqət tələb edir), GET-form фильтры (status/q/category, без JS,
  как `/reports/consumables`), таблица (material+категория, cari/minimum qalıq, status badge,
  tövsiyə olunan sifariş + purchase units, təchizatçı или placeholder, link на
  `/inventory/[id]`). Постоянная заметка "Avtomatik sifariş yaradılmır — yalnız tövsiyədir."
- **`components/inventory/LowStockAlertBadge.tsx`** (новый): badge для 4 новых статусов
  (danger/warning/info/success тона).
- **`app/(dashboard)/inventory/page.tsx`**: добавлена ссылка "Stok xəbərdarlıqları" (Bell icon)
  в header actions, `data-e2e-marker="low-stock-alerts-link"`.
- **`i18n/az.ts`**: новая секция `inventory.alerts.*` (summary, status, filter, table labels).
- **`scripts/e2e-low-stock-alerts-check.ts`**: 27 проверок (access, out/low/warning статусы,
  OK-item скрыт по умолчанию, reorder-формула + purchase unit, search/status/category
  фильтры, tenant isolation, supplier visibility).
- **`package.json`**: добавлен `e2e-low-stock-alerts-check`.
- **`docs/LOW_STOCK_ALERTS.md`**: новый profile-doc.
- **`docs/INVENTORY.md`**: добавлена строка `/inventory/alerts` в таблицу routes + ссылка.

**Supplier/catalog:** `InventoryItem.supplierId → Supplier` — прямой FK, уже существовал,
показан (имя + ссылка). `SupplierCatalogItem` связан только с `Supplier`, **не** с
`InventoryItem` — прямой связи каталог↔материал в schema нет, поэтому каталог не показывается
(задокументировано как not applicable, не выдумано).

**Не реализовано (out of scope по заданию сессии):**
- Автоматическое создание supplier order из рекомендации
- Background/cron digest по low-stock
- AI-прогнозирование спроса
- Редактирование minQuantity/остатка со страницы alerts (read-only; правка — через `/inventory/[id]`)

**E2E (все 14 суит после сессии):**
`e2e-low-stock-alerts-check` 27/27,
`e2e-consumables-audit-visibility-check` 28/28,
`e2e-treatment-consumable-reversal-check` 29/29,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-consumable-cost-reports-check` 30/30,
`e2e-service-consumable-templates-check` 30/30,
`e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33,
`e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38,
`e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42,
`e2e-demo-flow-check` 11/11.
Дополнительно (не в package.json, но затрагиваемые модули проверены): `e2e-dashboard-check`
20/20, `e2e-notifications-check` 17/17.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (49 routes).

---

## 7.16. Сессия 37 — итоги (Consumables Audit Visibility v1)

Polish-сессия без новых модулей, без DB migration, без бизнес-логики.

**Изменения:**
- **`lib/constants.ts`**: добавлены `treatment_usage` и `treatment_usage_reversal` в `MOVEMENT_TYPE_META`
  (AZ метки + sign), а также `supplier_receiving`.
- **`lib/treatment-consumables.ts`**:
  - `TreatmentConsumableUsageRow` расширен: `createdAt`, `createdByName`, `reversedByName`
  - Добавлена функция `getConsumableStatusMap(user, itemIds)` — единый bulk-запрос
    для вычисления статуса `"none" | "applied" | "reversed" | "reapplied"` по списку TreatmentItem
  - Добавлена функция `prisma.user.findMany` для получения displayName (secondary lookup)
- **`i18n/az.ts`**: добавлены `treatments.consumables.statusNone/statusApplied/statusReversed/statusReapplied`,
  `auditTitle`, `auditApplied/auditReversed/auditReapplied`, `stockDeducted/stockReturned`,
  `reversalReasonLabel`, `movementMarker`, `activeLabel/reversedLabel/skippedLabel`;
  `reports.consumables.recent.goToTreatment`
- **`components/treatments/TreatmentItemCard.tsx`**: новый проп `consumableStatusBadge?`
  (label + tone applied/reversed/reapplied), badge рендерится рядом с именем услуги
- **`components/treatments/TreatmentItemsList.tsx`**: новый проп `consumableStatusBadges?`
  (Record по id → badge), передаётся каждой карточке
- **`app/(dashboard)/treatments/page.tsx`** + **`patients/[id]/treatments/page.tsx`**:
  вызывают `getConsumableStatusMap`, строят `consumableStatusBadges`, передают в `TreatmentItemsList`
- **`components/treatments/TreatmentConsumableChecklist.tsx`**:
  - Расширены строки usage: qty с конвертацией дозы, status label, movement marker,
    createdByName, reversal details (причина, reversed by, reversal movement marker)
  - Добавлена секция «Sərfiyyat tarixçəsi» (`data-e2e-marker="audit-trail-section"`)
    со Step 1 (apply), Step 2 (reversal, `audit-reversal-step`), Step 3 (re-apply, `audit-reapply-step`)
- **`app/(dashboard)/reports/consumables/page.tsx`**: добавлена колонка «Müalicəyə keç»
  с Link → `/treatments/{treatmentItemId}/consumables` (`data-e2e-marker="report-go-to-treatment-{id}"`)
- **`scripts/e2e-consumables-audit-visibility-check.ts`**: 28 проверок (секции A–H)
- **`package.json`**: добавлен `e2e-consumables-audit-visibility-check`
- **docs**: обновлены `TREATMENT_CONSUMABLE_USAGE.md`, `TREATMENT_CONSUMABLE_REVERSAL.md`,
  `CONSUMABLE_COST_REPORTS.md`, `SESSION_HANDOFF.md`

**Не реализовано (out of scope по заданию сессии):**
- Частичный reversal отдельных строк
- Финансовая аналитика / cost snapshot
- Мутация склада

**E2E (все 13 суит после сессии):**
`e2e-consumables-audit-visibility-check` 28/28,
`e2e-treatment-consumable-reversal-check` 29/29,
`e2e-consumable-cost-reports-check` 30/30,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-service-consumable-templates-check` 30/30,
`e2e-inventory-units-check` 27/27,
`e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33,
`e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38,
`e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42,
`e2e-demo-flow-check` 11/11.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (47 routes).

---

## 7.15. Сессия 36 — итоги (Treatment Consumable Reversal v1)

Полный возврат (reversal) применённых расходников на лечение. Частичный reversal — out of scope v1.

**Изменения:**
- **Migration** `20260618100805_add_consumable_reversal`:
  - Новый enum value `treatment_usage_reversal` в `MovementType`
  - 5 новых колонок в `treatment_consumable_usages`: `is_reversed BOOL @default(false)`,
    `reversed_at TIMESTAMPTZ?`, `reversed_by_id UUID?`, `reversal_reason TEXT?`,
    `reversal_movement_id UUID? UNIQUE FK SET NULL InventoryMovement`
  - Индекс `@@index([isReversed])` для фильтрации
- **`prisma/schema.prisma`**: 5 полей + new index + new enum value
- **`lib/validation/treatment-consumables.ts`**: добавлен `reverseConsumablesSchema`
  (`treatmentItemId: uuid`, `reason: string min 3 max 500`)
- **`lib/treatment-consumables.ts`**: `TreatmentConsumableUsageRow` расширен 5 reversal-полями;
  `getConsumableUsagesForTreatment` возвращает все новые поля
- **`lib/actions/treatment-consumables.ts`**:
  - `applyTreatmentConsumablesAction`: guard обновлён — теперь проверяет `isReversed: false`,
    чтобы re-apply был разрешён после полного reversal
  - `reverseTreatmentConsumablesAction`: находит все active usages (wasSkipped=false,
    movementId≠null, isReversed=false), в транзакции с per-item advisory locks:
    создаёт `treatment_usage_reversal` movement, возвращает stock, помечает usage
    `isReversed=true` + audit fields. clinicId только из session.
- **`lib/consumable-cost-reports.ts`**: `buildWhere` добавлен `isReversed: false`
  (reversed usages исключены из cost totals)
- **`i18n/az.ts`**: секция `treatments.consumables.reversal.*` + error keys
  `noConsumablesToReverse`, `reasonTooShort`
- **`components/treatments/TreatmentConsumableReversalForm.tsx`** (новый):
  `useActionState` форма, всегда в DOM (нет expand/collapse), `data-e2e-marker="reversal-form"`,
  textarea reason (min 3, max 500), submit button
- **`components/treatments/TreatmentConsumableChecklist.tsx`**:
  - Ключевое исправление: early-return `templates.length === 0` теперь только при
    `!alreadyApplied` — если usages уже существуют, форма reversal всегда рендерится
    независимо от наличия шаблонов
  - Apply form guard добавлен `templates.length > 0` — не рендерит пустую форму
    после reversal при отсутствии шаблонов
  - `hasActiveUsages` / `allReversed` / `reversalInfo` логика для показа
    reversal form vs reversed info panel
- **`scripts/e2e-treatment-consumable-reversal-check.ts`**: 29/29 проверок (секции A–O)
- **`package.json`**: добавлен `e2e-treatment-consumable-reversal-check`
- **`docs/TREATMENT_CONSUMABLE_REVERSAL.md`**: новый profile-doc
- **`docs/TREATMENT_CONSUMABLE_USAGE.md`**: обновлён раздел double-apply protection
- **`docs/CONSUMABLE_COST_REPORTS.md`**: обновлён раздел "Only factual records"

**Не реализовано (out of scope):**
- Частичный reversal отдельных строк (v1 = только полный reversal всего TreatmentItem)
- Profitability analytics per doctor
- Payroll / salary reports
- Historical unit cost snapshot

**E2E (все 12 суит после сессии):**
`e2e-treatment-consumable-reversal-check` 29/29, `e2e-consumable-cost-reports-check` 30/30,
`e2e-treatment-consumable-usage-check` 38/38, `e2e-service-consumable-templates-check` 30/30,
`e2e-inventory-units-check` 27/27, `e2e-inventory-corrections-check` 34/34,
`e2e-inventory-check` 33/33, `e2e-supplier-receiving-check` 27/27,
`e2e-supplier-orders-check` 38/38, `e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42, `e2e-demo-flow-check` 11/11.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (40 routes).

---

## 7.6. Сессия 23 — итоги (Production Health & UX Polish)

Технические улучшения без новых CRM-модулей и без изменений schema.prisma:

- **`app/api/health/db/route.ts`**: новый эндпоинт `GET /api/health/db` — реальный пинг
  Postgres (`SELECT 1`). HTTP 200 при успехе, 503 при недоступности БД. Без авторизации;
  полезен для monitoring/alerting (Uptime Robot, Grafana) в отличие от `/api/health`
  (статичный, без проверки БД).
- **`middleware.ts`**: добавлен bypass для `/api/health/db` (рядом с существующим
  `/api/health`) — без этого неавторизованный запрос получал бы редирект на `/login`.
- **`package.json`**: два новых production-скрипта:
  - `prod:migrate` → `prisma migrate deploy` (идемпотентно, без seed и без build)
  - `prod:update` → `migrate deploy + generate + build` (типичное обновление production)
- **Toast-система** (`components/ui/Toaster.tsx`): `ToastProvider` (context, авто-dismiss
  4 с, макс 3 тоста) + `useToast()` hook. Обёрнут в `app/(dashboard)/layout.tsx`.
  Типы: `success` (зелёный) / `error` (красный).
- **Toast-интеграция**: `ClinicProfileForm`, `ClinicParamsForm`, `WorkingHoursForm`,
  `ProtocolCreateForm` — заменили inline-текст «Yadlandı» на toast через `useEffect` +
  `prevState` (срабатывает только при изменении state, не при начальном рендере).
- **GlobalSearch**: дебаунс 300ms → 400ms (снижает лишние запросы при быстром вводе).
- **`docs/DEPLOYMENT.md`** v1.2: таблица скриптов (`prod:migrate`/`prod:update`/
  `demo:deploy:init`), документация `/api/health/db` в §8, обновлён §4 (обновление деплоя).
- schema.prisma **не менялась**; все существующие e2e зелёные.

## 8. Следующая сессия (рекомендация)

Варианты по приоритету:
1. **Consumable Partial Reversal v2** — reversal отдельных строк (сейчас только
   полный reversal всего TreatmentItem). Требует UI выбора строк + partial guard.
2. **Consumable Cost Snapshot** — сохранять `unitCost` в момент списания в
   `TreatmentConsumableUsage`, чтобы cost reports не зависели от изменений цен.
3. **Profitability Analytics** — выручка (invoice) − себестоимость расходников
   per doctor / per service / per period.
4. **Запустить demo-деплой** — выполнить инструкцию FREE_DEMO_DEPLOY.md
   (Neon → `demo:deploy:init` → Vercel env vars → deploy).
5. **S3-совместимый storage** (MinIO / R2 / Supabase Storage) — необходим
   для надёжной работы uploads/PDF на Vercel, предпосылка для multi-instance;
   см. DEPLOYMENT.md §1. Единственная точка замены — `lib/storage.ts`.
6. Реальная отправка WhatsApp (Business API / провайдер) на основе
   подготовленных в v1 сообщений.
7. **Admin v2**: per-permission overrides UI (таблица `UserPermission`),
   email-инвайты, doctor transfer workflow.
8. **Platform billing**: подписки, квоты, ограничение числа пользователей/пациентов.
9. **Session invalidation**: при смене assignedDoctorId, пароля, логина или
   suspended-статусе инвалидировать JWT (server-side session store / revision field).
10. ~~**Low Stock Reorder Workflow v2**~~ ✅ сделано в Сессии 39 (LOW_STOCK_REORDER_DRAFTS.md).
11. ~~**Approval flow**~~ ✅ сделано в Сессии 40 (SUPPLIER_ORDER_DRAFT_APPROVAL.md) —
    draft→approved через явное подтверждение.
12. **Reorder Draft → Send v2**: кнопка "отправлено" прямо с `/inventory/alerts` после
    создания/подтверждения draft (сейчас — переход на страницу заказа и существующий
    "Mesajı kopyala" / markSupplierOrderSent flow).
13. **Consumable cost reports date filter timezone fix**: `e2e-consumable-cost-reports-check`
    (сессия 35) вычисляет "сегодня" через UTC ISO-строку, а серверный фильтр парсит дату как
    local-time — расхождение в окне 00:00–04:00 по Asia/Baku (UTC+4). Обнаружено в сессии 40,
    не исправлено (вне scope) — см. §7.19.

Завершено в Сессии 40 (Session 41 НЕ начинать в этой сессии).

## 9. Чек-лист конца сессии

1. `npm run db:seed` → `npx tsc --noEmit` → все e2e → `npm run build`
   (dev server на время build остановить, потом запустить обратно — 
   пользователь ожидает живой http://localhost:3000).
2. Обновить profile-док модуля в docs/ + этот файл (статус, риски, next step).
3. В отчёте: созданные/изменённые файлы, менялась ли schema (миграции),
   команды и результаты, e2e-итоги, что осталось placeholder, риски,
   что проверить вручную, предложение следующей сессии.

## 10. Карта документации

`PROJECT.md` (обзор) · `DATABASE.md` (схема, §3 tenant/§9 риски) ·
`DEVELOPMENT_RULES.md` (правила) · `DESIGN.md` (UI-система) · `SETUP.md`
(окружение) · profile-доки: PATIENTS, DENTAL_CHART, APPOINTMENTS, TREATMENTS,
FINANCE, INVENTORY, DASHBOARD, NOTIFICATIONS, DOCUMENTS, SETTINGS,
COMMUNICATIONS, GLOBAL_SEARCH, ADMIN, TREATMENT_PROTOCOLS, PLATFORM_ADMIN,
**DOCTOR_ASSISTANT_ASSIGNMENT**, **DOCTOR_TRANSFER**, **INVENTORY_CORRECTIONS**,
**INVENTORY_UNITS**, **SERVICE_CONSUMABLE_TEMPLATES**, **LOW_STOCK_ALERTS**,
**LOW_STOCK_REORDER_DRAFTS**, **SUPPLIER_ORDER_DRAFT_APPROVAL**,
**PATIENT_RESPONSE_LINKS**.
