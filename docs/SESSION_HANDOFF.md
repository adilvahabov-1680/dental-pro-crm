# Dental Pro CRM — Session Handoff
**by AV Systems** · обновлено: 2026-06-17 (после сессии 25: Doctor & Assistant Assignment v1)

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

Demo-логины (пароль у всех `Demo1234!`):
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
| Admin (кадры/роли/врач-ассистент, v1+password/login+assignment) | готов | `e2e-admin-check` 36/36 |
| Treatment Protocols & Follow-up | готов | `e2e-treatment-protocols-check` 31/31 |
| Platform Admin (super_admin, клиники) | готов | `e2e-platform-admin-check` 42/42 |

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
1. **Запустить demo-деплой** — выполнить инструкцию FREE_DEMO_DEPLOY.md
   (Neon → `demo:deploy:init` → Vercel env vars → deploy).
2. **S3-совместимый storage** (MinIO / R2 / Supabase Storage) — необходим
   для надёжной работы uploads/PDF на Vercel, предпосылка для multi-instance;
   см. DEPLOYMENT.md §1. Единственная точка замены — `lib/storage.ts`.
3. Реальная отправка WhatsApp (Business API / провайдер) на основе
   подготовленных в v1 сообщений.
4. **Admin v2**: per-permission overrides UI (таблица `UserPermission`),
   email-инвайты, doctor transfer workflow.
5. **Platform billing**: подписки, квоты, ограничение числа пользователей/пациентов.
6. Автоматизация cleanup файлов (cron на базе `cleanup-deleted-documents.ts`).
7. **Protocol follow-up automation**: использовать `intervalDays` для предложения
   конкретной даты follow-up (сейчас предложения — только по свободным слотам, без учёта интервала).
8. **Session invalidation**: при смене assignedDoctorId, пароля, логина или
   suspended-статусе инвалидировать JWT (server-side session store / revision field).

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
**DOCTOR_ASSISTANT_ASSIGNMENT**.
