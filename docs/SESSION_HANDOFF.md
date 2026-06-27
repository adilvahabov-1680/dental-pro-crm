# Dental Pro CRM — Session Handoff
**by AV Systems** · обновлено: 2026-06-24 (после сессии 63: Inventory / Medicine Units Audit & Architecture v1)

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
Сценарий показа клинике по ролям — [DEMO_PRESENTATION.md](DEMO_PRESENTATION.md) (сессия 52).

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
| Bildirişlər (in-app v1) | готов | `e2e-notifications-check` 34/34 |
| Sənədlər / PDF v1 | готов | `e2e-documents-check` 36/36 |
| Fayl yükləmə (Uploads v1 + soft-delete + клин. привязки) | готов | `e2e-file-uploads-check` 39/39, `e2e-document-clinical-links-check` 19/19 |
| Ayarlar (Settings v1) | готов | `e2e-settings-check` 43/43 |
| Əlaqə / Patient Communication (v1, manual click-to-chat; + Reminder Scheduling v2, Session 42; + Reschedule Options Flow v1, Session 43) | готов | `e2e-communications-check` 40/40, `e2e-appointment-reminder-scheduling-check` 28/28, `e2e-patient-reschedule-options-check` 39/39 |
| Global Search (topbar, v1) | готов | `e2e-global-search-check` 22/22 |
| Admin (кадры/роли/врач-ассистент/transfer, v1+password/login+assignment+transfer) | готов | `e2e-admin-check` 36/36, `e2e-doctor-transfer-check` 12/12 |
| Treatment Protocols & Follow-up | готов | `e2e-treatment-protocols-check` 31/31 |
| Treatment Recall / 6-Month Checkup v1 (Session 44, `/recalls`, `/treatments/[id]/recall`, WhatsApp click-to-chat) | готов | `e2e-recall-tasks-check` 39/39 |
| Patient Feedback / Review Flow v1 (Session 45, `/feedback`, rating 1–5, `/r/[token]` purpose=feedback) | готов | `e2e-patient-feedback-check` 40/40 |
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

Demo smoke-check (сессия 18, расширен в сессии 52, не дублирует модульные
наборы): `e2e-demo-flow-check` 19/19 — login owner/doctor/assistant,
dashboard, global search, карточка пациента, hesab, Ayarlar, Admin, + все
ключевые модули (patients/appointments/finance/inventory/recalls/feedback/
notifications), role-restrictions, /api/health, /login demo-hint sanity.
Подробный демо-сценарий — DEMO_PRESENTATION.md; dev-шпаргалка и известные
ограничения — DEMO.md.

Release-candidate smoke-check (сессия 53, дополняет, не дублирует
production-hardening-check): `e2e-release-candidate-check` — package
scripts/critical docs на месте, repo hygiene, demo-login + ключевые
страницы, `/api/health/db` и `/r/[token]` (bad token) безопасная форма
ответа. Сводный чеклист — RELEASE_CANDIDATE_CHECKLIST.md.

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

- pdfkit + DejaVu Sans (закоммиченные `assets/fonts/`, сессия 97 — не
  npm `dejavu-fonts-ttf`/node_modules; подробности — DOCUMENTS.md) —
  стандартные шрифты не знают ə/ş/ğ; `serverExternalPackages: ["pdfkit"]`
  в next.config.ts обязателен.
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
  часов. ~~`reminder_hours_before` пока не читается scheduler'ом~~ ✅ читается
  Session 42 (`listReminderCandidates` строит окно `[сейчас, +N часов]`) —
  scheduler/cron для авто-отправки всё ещё не существует, см. APPOINTMENT_REMINDER_SCHEDULING.md.
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
- **Patient Reschedule Options v1 (сессия 43)**: нет проверки занятости врача
  на предложенные сотрудником варианты времени (no overlap re-check) — staff
  сам отвечает за корректность выбора; advanced availability engine — future.
  Подробности — PATIENT_RESCHEDULE_OPTIONS.md.

## 7. Оставшиеся placeholder'ы

Кнопка «Pasiyent məlumat forması» (Tezliklə), **реальная** отправка
WhatsApp/SMS/email (v1 — только manual click-to-chat через wa.me, см.
COMMUNICATIONS.md), загрузка логотипа клиники (logoUrl в схеме, рендер в
PDF не делался), автоматический (cron) cleanup физических файлов
soft-deleted документов (v1 — ручной скрипт, см. DOCUMENTS.md).

## 7.25. Сессия 46 — итоги (Notification Permission Fix / Communication Polish v1)

Bugfix/polish-сессия, без новых модулей и без миграции. Закрывает находку
Session 45 (§8 п.20): `reschedule_offer` (Session 43) создавал корректную
tenant-level staff-задачу (`channel=in_app`), но `lib/notifications.ts:
TYPE_PERMISSION` не знал об этом типе — уведомление существовало в БД, но
было невидимо в bell/`/notifications` для всех пользователей независимо от
прав (баг видимости, не баг данных). Заодно — полный аудит всей карты
`TYPE_PERMISSION` против каждого реального `notification.create()` в
кодовой базе (15 call sites), чтобы убедиться, что других таких пропусков
нет. Подробности — **[NOTIFICATIONS.md](NOTIFICATIONS.md)**, раздел
«Дополнение (Session 46)».

**Изменения:**
- **`lib/notifications.ts`**: `+1` строка — `reschedule_offer:
  "appointments.view"` в `TYPE_PERMISSION` (единственный реально
  отсутствовавший тип; `feedback_received`/`inventory_low_stock` уже были
  корректны, `followup`/`treatment_pdf`/`debt_reminder`/`custom`/
  `repeat_visit_reminder`-as-in-app зарезервированы и нигде не создаются —
  записи для них в карте безвредны).
- **`i18n/az.ts`**: `notifications.types.reschedule_offer`/`feedback_received`
  добавлены (этот словарь — отдельный от `COMMUNICATION_TYPE_META`, который
  относится к патиентской «Əlaqə tarixçəsi», не к bell; без записи bell
  показывал бы сырое имя enum'а вместо AZ-метки).
- **`components/notifications/NotificationsList.tsx`**: `TYPE_ICON.
  reschedule_offer = CalendarClock` (та же иконка, что в
  `RescheduleOptionsSelectionForm`/`PatientResponseForm` для
  reschedule-варианта ответа; раньше — fallback `Bell`).
- **`scripts/e2e-patient-reschedule-options-check.ts`**: +1 проверка (E9) —
  staff-уведомление реально видно на `/notifications`, не только что
  существует в БД (39 → 40).
- **`scripts/e2e-notifications-check.ts`**: расширен (не создавался новый
  файл — существующий был компактным), +17 проверок (17 → 34): видимость
  `reschedule_offer`/`feedback_received`/`repeat_visit_reminder` для
  владельца (`appointments.view`+`patients.view`), **отсутствие**
  видимости для пользователя без этих прав (роль `reception` + personal-deny
  через `UserPermission{allowed:false}` на `appointments.view`/
  `patients.view` — даёт «есть `notifications.view`, но нет
  appointment/patient-доступа», изолированно проверяя именно
  `TYPE_PERMISSION`-фильтрацию, а не внешний page-gate), delta unread-счётчика
  (+3 у владельца, +0 у урезанного пользователя — сравнение до/после
  создания тестовых записей, без зависимости от абсолютных чисел), и что
  `mark all as read` от урезанного пользователя не трогает уведомления вне
  его scope (architecture уже корректна — `notificationScopeWhere(user)`
  внутри `updateMany`-where, без редизайна).
- **docs**: обновлены `NOTIFICATIONS.md` (таблица `TYPE_PERMISSION` +
  раздел «Дополнение (Session 46)»), `PATIENT_RESCHEDULE_OPTIONS.md`
  (фикс + E2E-счётчики), `PATIENT_FEEDBACK.md` (закрыта находка Session 45),
  этот файл.

**Mark-read архитектура — проверена, без изменений.** Task допускал
«если mark-all-read сейчас глобален по tenant — задокументировать как
known limitation»; по факту `markNotificationRead`/`markAllNotificationsRead`
уже применяли `notificationScopeWhere(user)` внутри `updateMany`-where —
пользователь не может пометить прочитанным то, что вне его видимого scope.
Подтверждено e2e, никакой known limitation не найдено, редизайн не
требовался.

**E2E (после сессии):** `e2e-notifications-check` 34/34,
`e2e-patient-reschedule-options-check` 40/40, `e2e-patient-feedback-check`
40/40, `e2e-recall-tasks-check` 39/39, `e2e-communications-check` 40/40,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.

**Не реализовано (по scope, намеренно):** WhatsApp Business API, SMS/email
провайдер, автоматическая отправка, новые patient portal функции, recall
protocol engine, payment automation, редизайн read-state архитектуры
(per-user read tracking — остаётся известным ограничением v1, см.
NOTIFICATIONS.md).

## 7.26. Сессия 47 — итоги (Debt Reminder / Payment Communication v1)

Очередь debt reminder поверх уже существующего `Debt`-кэша (Session 9) и
уже существующего `prepareInvoiceReminder` (Session 15) — новый server
action не вводился, расширено существующее действие. Без миграции — поле
`Debt.lastReminderAt` существовало в схеме с самого начала, но ничего его
не заполняло до этой сессии. Подробности —
**[DEBT_REMINDERS.md](DEBT_REMINDERS.md)**.

**Изменения:**
- **`lib/finance.ts`**: `listDebtReminderCandidates(user)` — очередь
  открытых/частичных `Debt` в scope пользователя (как остальные
  finance-запросы), сортировка — самый большой остаток первым;
  `listPatientFinance` теперь дополнительно возвращает `lastReminderAt`
  (`_max` по открытым/частичным долгам пациента).
- **`lib/actions/communications.ts`**: `prepareInvoiceReminder` —
  (1) отклоняет полностью оплаченный/отменённый счёт (`{ error:
  "fullyPaid" }`, без записи), раньше сервер не перепроверял это (UI
  просто не показывал кнопку); (2) после успешной подготовки обновляет
  `Debt.lastReminderAt = now()`; (3) добавлен `revalidatePath("/finance/debts")`.
- **`app/(dashboard)/finance/debts/page.tsx`** (новый) + **`components/
  finance/DebtReminderRow.tsx`** (новый) — очередь, переиспользует
  существующий `WhatsAppActionButton`/`prepareInvoiceReminder`.
- **`app/(dashboard)/finance/page.tsx`**: кнопка-ссылка «Borclar» в шапке.
- **`components/finance/PatientFinanceBlock.tsx`** + **`app/(dashboard)/
  patients/[id]/page.tsx`**: рядом с debt-бейджем показывается «Son
  xatırlatma» (дата последнего напоминания или «Hələ xatırladılmayıb»).
- **`i18n/az.ts`**: `finance.debts.*` (новая секция), `finance.patientBlock.
  lastReminder`/`neverReminded`, `communications.errors.fullyPaid`.
- **`scripts/e2e-debt-reminders-check.ts`** (новый, 27 проверок) +
  `package.json`: `e2e-debt-reminders-check`.
- **docs**: новый `DEBT_REMINDERS.md`; обновлены `COMMUNICATIONS.md`
  (раздел «Дополнение (Session 47)»), `NOTIFICATIONS.md` (подтверждение,
  что `debt_reminder` остаётся зарезервированным in-app типом — Session 47
  не создаёт tenant-level in-app уведомление), `FINANCE.md` (новый route,
  `lastReminderAt`), этот файл.

**Известный риск инфраструктуры (не код-баг):** во время этой сессии
`npm run build`, запущенный при живом `next dev`, разделяющем `.next/`,
один раз привёл к падению dev-воркеров («Jest worker encountered 2 child
process exceptions») — потребовался перезапуск dev-сервера. Чек-лист §9 уже
предупреждает об этом («dev server на время build остановить, потом
запустить обратно»); ничего в коде модуля не изменялось из-за этого.

**E2E (после сессии):** `e2e-debt-reminders-check` 27/27 (новый),
`e2e-finance-check` 47/47, `e2e-communications-check` 40/40,
`e2e-notifications-check` 34/34, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (новый route
`/finance/debts`).

**Не реализовано (по scope, намеренно):** WhatsApp Business API/реальная
отправка, online payment gateway/link, cron-автоматизация напоминаний,
редизайн finance-модуля, accounting module, subscription billing, patient
portal.

## 7.27. Сессия 49 — итоги (E2E Seed Stability / Communications Test Fix v1)

Test-infra-сессия, без изменений бизнес-логики и без миграции. Предыдущая
закрытая сессия — **Сессия 48 (Production Hardening / Security Review v1**,
см. [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md)) — закончилась с
единственным неполным чек-листом: `e2e-communications-check` дал 33/40,
причина — time-of-day-зависимый seed artifact, не регрессия от изменений
Сессии 48.

**Root cause:** `prisma/seed.ts` создаёt demo-приёмы Rəşad/Leyla на
фиксированные `hour: 10`/`hour: 11` «сегодня» (идемпотентно освежается
только дата, не час). `scripts/e2e-communications-check.ts` искал именно
эти seed-приёмы по marker'у в `notes` для проверки dashboard-панели
«Qəbul xatırlatmaları» (`listReminderCandidates`: окно
`[now, now + reminder_hours_before]`, по умолчанию 24ч). Если тест
запускается после 10–11 утра, оба приёма уже в прошлом и выпадают из окна
— assertions падают. **Это не новая проблема**: тот же artifact уже
случался в Сессии 41 (см. §7.20 этого файла, «Замечание по тесту») и
тогда был временно обойдён через повторный `npm run db:seed` — не
зафиксирован постоянно.

**Постоянный fix (Сессия 49):** тест больше не зависит от seed/времени
суток. `scripts/e2e-communications-check.ts` теперь создаёт собственные
тестовые приёмы (`resadTestAppt`/`leylaTestAppt`) относительно текущего
момента запуска (`now + 2ч` / `now + 3ч`) — всегда внутри окна
напоминаний независимо от часа дня, и удаляет их в `finally`. Удалён
прежний `prisma.appointment.findFirstOrThrow(... notes: "demo-seed:Diş
ağrısı (16)" ...)`. Бизнес-логика напоминаний (`listReminderCandidates`,
`reminder_hours_before`) **не менялась** — найденная нестабильность была
только в тестовых данных, не в продукте.

**Изменения:**
- **`scripts/e2e-communications-check.ts`**: добавлено создание
  `resadTestAppt`/`leylaTestAppt` (с очисткой), убран seed-зависимый
  lookup, обновлены 2 ссылки (`resadAppt.id` → `resadTestAppt.id`) и текст
  одного check-лейбла («today appt» → «in reminder window», точнее
  отражает суть проверки). Количество проверок не изменилось — 40/40.
- **`prisma/seed.ts`** — без изменений (намеренно: фикс в тесте, не в
  seed, как и просил scope).
- **docs**: обновлены `COMMUNICATIONS.md` (раздел E2E), этот файл.

**E2E (после сессии):** `e2e-communications-check` 40/40 (проверено в
12:53 — заведомо «опасное» время суток, после старого порога 10–11
утра), полная регрессия — `e2e-patient-response-links-check` 42/42,
`e2e-patient-reschedule-options-check` 40/40, `e2e-patient-feedback-check`
40/40, `e2e-recall-tasks-check` 39/39, `e2e-debt-reminders-check` 27/27,
`e2e-notifications-check` 34/34, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-production-hardening-check` 42/42.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.

**Не реализовано (по scope, намеренно):** изменения seed-данных, изменения
`reminder_hours_before`/бизнес-логики напоминаний, новые бизнес-функции,
redesign UX.

## 7.28. Сессия 50 — итоги (UX / Mobile Doctor Workflow Polish v1)

CSS-only polish-сессия, без изменений бизнес-логики/схемы/permissions.
Цель — убрать horizontal overflow и улучшить плотность action-рядов на
360–768px для врача/ассистента на телефоне/планшете. Подробности —
**[UX_MOBILE_POLISH.md](UX_MOBILE_POLISH.md)**.

**Найден и исправлен реальный (не гипотетический) баг**: `/finance/debts`
на 390px давал `scrollWidth=504` vs `clientWidth=390` (114px overflow).
Причина — `DebtReminderRow`/`TreatmentItemCard`/`AppointmentCard`/
`InvoiceCard` использовали `flex shrink-0 ... gap-X` на action-zone:
`flex-shrink:0` резервирует ей полную «однострочную» (max-content)
ширину независимо от её СОБСТВЕННОГО `flex-wrap` — поэтому первая
попытка фикса (только снять `sm:flex-nowrap` с внешнего ряда, добавить
`flex-wrap` на action-zone, оставив `shrink-0`) **не устраняла overflow**
(проверено эмпирически через интерактивный MCP preview-браузер: resize
360/390/430/660/768/1024px + замер `scrollWidth` vs `clientWidth` —
надёжнее скриншотов, которые в этой среде стабильно зависали по
таймауту). Финальный fix — снять именно `shrink-0` с action-zone,
оставив `flex-wrap`: тогда зона может сжаться, а её дети реально
переносятся на новые строки при нехватке места. На широких экранах
поведение не меняется (сжатие не активируется, когда места достаточно).

**Изменения:**
- **`components/finance/DebtReminderRow.tsx`**: ряд + action-zone —
  всегда `flex-wrap`, `shrink-0` снят с action-zone (реальный фикс).
- **`components/treatments/TreatmentItemCard.tsx`**: тот же фикс
  (action-zone — до 4–5 элементов: materials/consumables/recall/
  feedback-кнопка + цена + статус) + `aria-label` на icon-only действиях
  (materials/consumables/recall/follow-up — зеркалит существующий
  `title`, иначе screen reader молчит).
- **`components/appointments/AppointmentCard.tsx`**: тот же фикс +
  `aria-label` (dental chart/add treatment).
- **`components/finance/InvoiceCard.tsx`**: тот же фикс (для
  консистентности — собственная action-zone короче, ниже риск).
- **`components/patients/PatientsTable.tsx`**: `aria-label` на Eye/Pencil
  action-иконках.
- **`scripts/e2e-mobile-ux-check.ts`** (новый, 59 проверок) +
  `package.json`: `e2e-mobile-ux-check`.
- **docs**: новый `UX_MOBILE_POLISH.md`, этот файл.

**Не тронуто (намеренно)**: `components/inventory/InventoryItemCard.tsx`
имеет тот же риск-паттерн, но `/inventory` не входит в scope этой
сессии — оставлен как follow-up. Tap-target размеры (`size-8`),
dashboard-панели (реордеринг под «what needs action today»
рассматривался, не сделано — нет конкретной находки) — не менялись.

**E2E (после сессии):** `e2e-mobile-ux-check` 59/59 (новый),
`e2e-demo-flow-check` 11/11, `e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42, `e2e-appointments-check` 28/28,
`e2e-patient-response-links-check` 42/42,
`e2e-patient-reschedule-options-check` 40/40,
`e2e-patient-feedback-check` 40/40, `e2e-recall-tasks-check` 39/39,
`e2e-debt-reminders-check` 27/27, `e2e-notifications-check` 34/34,
`e2e-communications-check` 40/40, `e2e-production-hardening-check` 42/42,
`e2e-finance-check` 47/47 (InvoiceCard тронут — регрессия).

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.

**Не реализовано (по scope, намеренно):** новые бизнес-функции, полный
redesign/layout-переписывание, увеличение tap-target размеров, user
manual/screenshot-гайд (финальная фаза проекта).

## 7.29. Сессия 51 — итоги (Inventory Mobile Polish / Final UI Consistency v1)

CSS-only polish-сессия (закрывает inventory follow-up из Сессии 50), без
изменений бизнес-логики/схемы/permissions. Подробности —
**[UX_MOBILE_POLISH.md](UX_MOBILE_POLISH.md)** (раздел «Дополнение
(Сессия 51)»).

**Найдено и исправлено 2 реальных бага** (оба подтверждены интерактивно
через MCP preview-браузер, `window.scrollTo` как ground truth — см.
методологическую находку в UX_MOBILE_POLISH.md):
1. `InventoryItemCard.tsx` — тот же паттерн, что у `DebtReminderRow` в
   Сессии 50 (`sm:flex-nowrap` + `shrink-0` на action-zone). Тот же фикс.
2. **Новый, отдельный баг**: `/inventory` PageHeader actions (5 ссылок:
   alerts/reports/orders/suppliers/+new) рендерились в
   `flex items-center gap-2` **без `flex-wrap` вовсе** — последняя ссылка
   уходила на `right:693px` при `clientWidth:390px`. Фикс — добавлен
   `flex-wrap`.

**Побочные находки (вынесены в отдельные scope-чистые коммиты, не
часть mobile-polish):**
- React RSC warning «Only plain objects can be passed to Client
  Components» — Prisma `Decimal`-поля (`quantity`, `price`,
  `purchaseToBaseFactor` и др.) передавались в client-компоненты
  напрямую. Закрыто `8635c7a fix: serialize inventory decimals`
  (`lib/inventory.ts`, `lib/supplier-orders.ts`, `lib/suppliers.ts` —
  сериализация в `number` на границе query-слоя).
- `components/supplier-orders/AddToOrderButton.tsx` — мёртвый код (не
  импортировался нигде). Закрыто `d574fe5 chore: remove unused supplier
  order action` (удалён компонент + orphaned action
  `addCatalogItemToOrderFromSupplierPage` в `lib/actions/supplier-orders.ts`
  + строка в `docs/SUPPLIER_ORDERS.md`).

**Изменения (mobile polish, отдельный коммит):**
- **`components/inventory/InventoryItemCard.tsx`**: фикс #1.
- **`app/(dashboard)/inventory/page.tsx`**: фикс #2.
- **`components/suppliers/SupplierDetailCard.tsx`**: `aria-label` на
  edit-кнопке.
- **`components/supplier-orders/OrderItemsTable.tsx`**: `aria-label` на
  remove-кнопке.
- **`scripts/e2e-mobile-ux-check.ts`**: расширен +7 страниц
  (`/inventory` и под-страницы) + точечные регрессии на оба бага +
  aria-label на supplier detail (59 → существенно больше проверок).
- **docs**: обновлены `UX_MOBILE_POLISH.md`, этот файл.

**Не тронуто (намеренно)**: `TreatmentPlanSummary.tsx` имеет похожий
`shrink-0`-паттерн, но это treatments-модуль (не inventory/supplier),
вне scope этой сессии, и сам блок низкого риска (всего 2 мелких
элемента в action-zone, внешний контейнер уже `flex-wrap`) — не
демонстрировал overflow на уже проверенных в Сессии 50
`/patients/[id]/treatments`.

**E2E (после сессии):** `e2e-mobile-ux-check` (расширен, зелёный),
`e2e-inventory-check` 33/33, `e2e-supplier-receiving-check` 27/27,
`e2e-supplier-order-draft-approval-check` 31/31, `e2e-demo-flow-check`
11/11, `e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.

**3 раздельных коммита (один scope = один коммит):**
`8635c7a fix: serialize inventory decimals` →
`d574fe5 chore: remove unused supplier order action` →
`chore: polish inventory mobile layout` (mobile polish, этот раздел).

**Не реализовано (по scope, намеренно):** новые бизнес-функции, полный
redesign, увеличение tap-target размеров, user manual/screenshot-гайд
(финальная фаза проекта).

## 7.30. Сессия 52 — итоги (Demo / Public Presentation Polish v1)

Polish-сессия без новых бизнес-модулей, без изменений business logic/schema/
permissions/security model. Цель — подготовить CRM к нормальному demo/public
presentation режиму перед показом владельцам клиник.

**Находки (architecture note перед реализацией):**
1. Demo-логин уже был хорошо реализован: `app/login/page.tsx` показывает
   подсказку «Demo giriş / admin / admin123», управляется
   `NEXT_PUBLIC_DEMO_MODE`. Это **не баг**, а два намеренно разных пароля
   для двух сред — local dev (`Demo1234!`, см. SETUP.md) vs. свежий
   публичный Vercel/Neon demo (`admin123`, см. FREE_DEMO_DEPLOY.md);
   подтверждено bcrypt-сравнением реального хэша в локальной БД. Решение —
   не трогать пароли/семь, только мелкая copy-полировка подсказки.
2. Найден и исправлен реальный 1-строчный баг: `scripts/e2e-doctor-transfer-check.ts`
   дефолтил пароль `admin123` вместо `Demo1234!`, как остальные 40 локальных
   e2e-скриптов — упал бы при запуске без явного `SEED_DEMO_PASSWORD`.
3. Публичной landing/light-HTML страницы нет — `/` просто редиректит на
   `/login`/`/dashboard`; единственная публичная страница — `/r/[token]`
   (patient response links, не маркетинговая). Ничего «устаревшего» чинить
   не пришлось.
4. `prisma/seed.ts` не создаёт примеров для `RecallTask`, `PatientFeedback`,
   лога коммуникаций — намеренно **не добавлялись** seed-записи в этой
   сессии (риск незаметно задеть count-based проверки в ~40 e2e-наборах,
   которые не успели аудировать построчно за разумное время). Вместо этого —
   честная документация текущего покрытия + инструкция «подготовить живой
   пример за 1 клик» в DEMO_PRESENTATION.md §5.

**Изменения:**
- **`app/login/page.tsx`**: под demo-подсказкой добавлена одна строка
  («Klinika sahibi demo hesabı — bütün modullara giriş») — copy-полировка,
  без изменения логики/спейсинга.
- **`scripts/e2e-doctor-transfer-check.ts`**: фикс дефолтного пароля (находка
  #2 выше).
- **`scripts/e2e-demo-flow-check.ts`**: расширен 11/11 → 19/19 — добавлены
  проверки открытия `/patients`, `/appointments`, `/finance`, `/inventory`,
  `/recalls`, `/feedback`, `/notifications` под owner, плюс проверка
  `/login` demo-hint (real dev-пароль не сочится в HTML; если подсказка
  показана — корректно содержит admin/admin123).
- **`docs/DEMO_PRESENTATION.md`** (новый): структурированный сценарий показа
  клинике по ролям (owner/həkim/assistent) — demo URL, credentials, 10-шаговый
  путь, что говорить каждой роли, что НЕ обещать (WhatsApp Business API,
  payment gateway, patient portal, PDF user manual — финальная фаза),
  текущее покрытие demo-данных.
- **`docs/DEMO.md`**: добавлена ссылка на DEMO_PRESENTATION.md, новые URL
  (`/recalls`, `/feedback`, `/finance/debts`), пометка про пустые
  Recall/Feedback/Əlaqə на свежем seed.
- **`docs/FREE_DEMO_DEPLOY.md`**: добавлена ссылка на DEMO_PRESENTATION.md.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, demo-логины
  секция, demo smoke-check счётчик, этот раздел.

**Не реализовано (по scope, намеренно):** изменения `prisma/seed.ts`,
PDF/user manual со скриншотами, полная маркетинговая landing-страница,
WhatsApp Business API, payment gateway, full patient portal, automatic
sending, analytics v2.

**E2E (после сессии):** `e2e-demo-flow-check` 19/19 (расширен),
`e2e-doctor-transfer-check` 16/16 (баг-фикс пароля подтверждён зелёным),
+ полный обязательный регрессионный набор (mobile-ux, production-hardening,
admin, platform-admin, patient-response-links, patient-reschedule-options,
patient-feedback, recall-tasks, debt-reminders, notifications,
communications) — итоги см. в отчёте коммита.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.
schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: polish demo presentation`.

## 7.31. Сессия 53 — итоги (Final QA / Release Candidate Checklist v1)

QA/release-аудит без новых бизнес-модулей, без изменений business logic/
schema/permissions/security model. Цель — собрать сводный
[RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) и
зафиксировать, что осталось до v1.0.

**Находки (architecture note перед реализацией):**
1. Все 19 release-critical workflows (login, patients, appointments, dental
   chart, treatments/consumables, finance/debt reminders, documents,
   inventory/suppliers, response links, reschedule, recall, feedback,
   notifications, communications, mobile UX, production hardening) — зелёные
   на момент аудита, ни одного реального бизнес-бага не найдено.
2. Все 12 проверенных module-docs (PATIENT_RESPONSE_LINKS, PATIENT_RESCHEDULE_OPTIONS,
   RECALL_TASKS, PATIENT_FEEDBACK, DEBT_REMINDERS, UX_MOBILE_POLISH, FINANCE,
   INVENTORY, SUPPLIER_*, DEPLOYMENT) — внутренне консистентны, кросс-ссылки
   валидны, env vars в DEPLOYMENT.md точно совпадают с `.env.example`.
3. `docs/PRODUCTION_HARDENING.md` (сессия 48) — уже исчерпывающий security-аудит;
   повторно проверены ключевые утверждения (256-бит токены, tenant-isolation
   паттерн, permission-guard coverage — 120 `requirePermission`, 146
   `tenantClient`, 25/25 файлов `lib/actions/*` со ссылкой на `clinicId`) —
   все подтвердились.
4. Только 3 строки кода с TODO (`lib/actions/appointments.ts` — timezone MVP-нота,
   `lib/i18n.ts` ×2 — ru/en stub на v1.2) — все намеренные, задокументированные,
   не баги.
5. **Package scripts gap**: 17 из 39 `scripts/e2e-*.ts` не были
   зарегистрированы в `package.json` (только `npx tsx`). Добавлены 3
   запрошенных (`e2e-notifications-check`, `e2e-communications-check`,
   `e2e-finance-check`) + новый `e2e-release-candidate-check`; остальные 14 —
   намеренно не трогались (вне named scope), задокументированы как known gap.

**Изменения:**
- **`package.json`**: +4 script entries (3 запрошенных + новый RC-чек).
- **`scripts/e2e-release-candidate-check.ts`** (новый): легкая проверка —
  package scripts/critical docs на месте, repo hygiene (`git ls-files`),
  demo-login + dashboard/patients/finance открываются, `/api/health/db`
  отдаёт безопасную форму (`ok:boolean`, `db:string`), `/r/bad-token` —
  generic safe state без утечки имён пациентов. Не дублирует
  `e2e-production-hardening-check.ts` — пересекающиеся проверки минимальны.
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`** (новый): A) статус релиза,
  B) core workflows чеклист (19 строк, e2e-ссылки), C) security checklist
  (выжимка из PRODUCTION_HARDENING.md, повторно проверена), D) deployment
  checklist (env vars, migration, seed, Vercel/Neon, storage, backup),
  E) demo checklist (ссылка на DEMO_PRESENTATION.md), F) known limitations
  (продуктовые/технические/процессные), G) prioritized remaining-before-v1.0.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, доб. ссылки
  на DEMO_PRESENTATION/RELEASE_CANDIDATE_CHECKLIST в карту документации (§10),
  этот раздел.

**Не реализовано (по scope, намеренно):** изменения бизнес-логики/schema,
PDF user manual со скриншотами, WhatsApp Business API, payment gateway,
full patient portal, analytics v2, внешние security-сканеры, регистрация
оставшихся 14 e2e-скриптов (низкий приоритет, см. checklist §G).

**E2E (после сессии):** `e2e-release-candidate-check` (новый, зелёный) +
полный обязательный регрессионный набор (demo-flow, production-hardening,
mobile-ux, communications, notifications, finance, inventory, admin,
platform-admin) — итоги см. в отчёте коммита.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.
schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: add release candidate checklist`.

## 7.32. Сессия 54 — итоги (Deployment / Backup / Monitoring v1)

DevOps/docs-сессия без новых бизнес-модулей, без изменений business logic/
schema/permissions/security model. Цель — задокументировать backup-policy,
monitoring-чеклист и исполняемый deployment runbook, которых не было.

**Находки (architecture note перед реализацией):**
1. Все обязательные env vars (`DATABASE_URL`, `SESSION_SECRET`, `AUTH_MOCK`,
   `NEXT_PUBLIC_DEMO_MODE`, `SEED_DEMO_PASSWORD`, опциональные
   `NEXT_PUBLIC_APP_URL`/`PLATFORM_OWNER_*`) уже были полно задокументированы
   в `.env.example` с dev-vs-production guidance — **изменений не потребовалось**.
2. `GET /api/health` (статичный, `{ok:true, service}`) и `GET /api/health/db`
   (реальный пинг Postgres, безопасная форма ошибки, без утечки деталей)
   — оба **уже существовали** и оба безопасны — повторная проверка кода
   подтвердила, новый health-эндпоинт добавлять не требовалось.
3. `docs/DEPLOYMENT.md` §5 уже содержал backup-механику (pg_dump/restore
   команды, порядок восстановления, upload-ограничение) — но **не было**
   расписания/retention/test-restore рекомендации и **monitoring-раздела
   не было вовсе** (что именно мониторить, кроме самого факта существования
   health-эндпоинтов). Это и стало содержанием `BACKUP_MONITORING.md`.
4. Не было единого исполняемого deployment-чеклиста (pre-deploy → migrate →
   seed caution → build → smoke tests → rollback → post-deploy) — шаги были
   разбросаны между DEPLOYMENT.md «полезные команды» и RELEASE_CANDIDATE_CHECKLIST.md.
   Это стало содержанием `DEPLOYMENT_RUNBOOK.md`.
5. Prisma migrations — 17 применённых, ни одной pending; schema.prisma
   **не менялась**, migration не требовалась.

**Изменения:**
- **`docs/BACKUP_MONITORING.md`** (новый): PostgreSQL backup (pg_dump/restore/
  расписание/retention), backup `uploads/` (VPS/local vs. Vercel-ограничение),
  test-restore рекомендация, аварийный чеклист восстановления, что/кого
  мониторить (health-эндпоинты, диск, логи, возраст backup, TLS-сертификат).
- **`docs/DEPLOYMENT_RUNBOOK.md`** (новый): pre-deploy checklist, env vars
  табличкой, migration, seed/demo steps с production-caution, build
  verification, 5 smoke tests (login/dashboard/`/api/health`/`/api/health/db`/
  `/r/bad-token`), rollback notes (код без миграции vs. код+миграция),
  post-deploy checklist.
- **`scripts/e2e-deployment-readiness-check.ts`** (новый) + package script:
  легкая проверка — deployment/backup/runbook docs на месте, `.env.example`
  содержит обязательные ключи, package scripts (build/prod:migrate/
  prod:update/RC-checks) зарегистрированы, repo hygiene, `/api/health` +
  `/api/health/db` отвечают, `/login` открывается. Не дублирует
  `e2e-release-candidate-check.ts` (там — demo-login, ключевые страницы под
  сессией, `/r/bad-token`).
- **`docs/DEPLOYMENT.md`**: добавлены ссылки на DEPLOYMENT_RUNBOOK.md и
  BACKUP_MONITORING.md (заголовок, §3, §5).
- **`docs/PRODUCTION_HARDENING.md`**: добавлены ссылки на BACKUP_MONITORING.md
  (§9, §10) — уточнено, что backup/monitoring policy теперь документирована,
  но автоматизация/платные инструменты — всё ещё future.
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`**: §D дополнен ссылками на новые
  docs; §G «Backup/monitoring strategy» переформулирован — policy готова,
  осталось только реальное подключение на целевой инфраструктуре; добавлены
  ссылки в «См. также».
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, доб. ссылки
  в карту документации (§10), этот раздел.

**Не реализовано (по scope, намеренно):** изменения business logic/schema,
новый общий health-эндпоинт (уже существовал), автоматизация cron backup,
платная monitoring/alerting интеграция, object storage для `uploads/`,
PDF user manual, WhatsApp Business API, payment gateway, full patient portal.

**E2E (после сессии):** `e2e-deployment-readiness-check` (новый, зелёный) +
полный обязательный регрессионный набор (release-candidate, production-
hardening, demo-flow, admin, platform-admin) — итоги см. в отчёте коммита.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.
schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: add deployment runbook`.

## 7.33. Сессия 55 — итоги (External Audit Setup / CodeQL + Dependency Scan v1)

DevOps/security-сессия без новых бизнес-модулей, без изменений business
logic/schema. Цель — настроить автоматические внешние проверки (CodeQL,
базовый CI, `npm audit`) и задокументировать ручной/внешний audit checklist.

**Находки (architecture note перед реализацией):**
1. `.github/` не существовал вовсе — ни CI, ни CodeQL не было настроено до
   этой сессии. Все предыдущие упоминания «audit» в коде — это бизнес-таблица
   `audit_log`, не связано с external security scanning.
2. `npm audit --audit-level=moderate` — реально снят (не гипотетически):
   4 находки. **esbuild** (low, транзитивная dev-зависимость `tsx`) —
   безопасный патч 0.28.0→0.28.1 без breaking changes, подтверждено
   dry-run — исправлено. **postcss** (moderate, вложена внутрь `next`'s
   `node_modules`) — фикс требует откатить Next.js до 9.x canary (breaking,
   неприемлемо) — принято как риск, не трогается. **xlsx** (high, prototype
   pollution + ReDoS) — нет фикса в npm-реестре вообще; митигация —
   вызов закрыт `requirePermission("inventory.manage")`, файл парсится
   только в памяти, не публичный эндпоинт — принято как риск с митигацией.
3. Эмпирически проверено: `next build` успешно проходит с dummy/недостижимым
   `DATABASE_URL` и dummy `SESSION_SECRET` — ни одна страница не делает
   DB-запрос на этапе build (всё `ƒ Dynamic`, кроме `/login` — `○ Static`
   без DB). Это подтвердило безопасность дизайна `ci.yml` без живой БД и
   без секретов.
4. E2E-наборы (требуют живую Postgres + seed) **не включены** в CI в этой
   сессии — нет настроенной CI-БД; включение — future work (см.
   EXTERNAL_AUDIT.md §1.4).

**Изменения:**
- **`.github/workflows/codeql.yml`** (новый): official `github/codeql-action`
  паттерн (init/autobuild/analyze), триггеры push/PR на `main`,
  `javascript-typescript`, без секретов, без DB/migration/seed.
- **`.github/workflows/ci.yml`** (новый): checkout → setup-node@20 → `npm ci`
  → `prisma generate` → `tsc --noEmit` → `next build`, только dummy env
  (`DATABASE_URL`/`SESSION_SECRET` — явно нереальные значения, без секретов
  репозитория).
- **`package-lock.json`**: `npm audit fix` — esbuild 0.28.0→0.28.1 (dev-only,
  non-breaking, подтверждено).
- **`package.json`**: +3 script entries — `audit:deps`
  (`npm audit --audit-level=moderate`), `e2e-external-audit-setup-check`.
- **`docs/EXTERNAL_AUDIT.md`** (новый): автоматические проверки (CodeQL/CI/
  npm audit — настроены), внешние инструменты (Snyk/OWASP ZAP/SonarQube/
  Dependabot — только документированы), manual audit checklist (token flow/
  tenant isolation/permissions/file upload/backup-restore/env review —
  ссылки на уже выполненные проверки в PRODUCTION_HARDENING.md), текущие
  npm audit findings (таблица), evidence-шаблон для фиксации будущих
  прогонов.
- **`scripts/e2e-external-audit-setup-check.ts`** (новый, чисто статический
  — НЕ требует dev-сервера/БД): файлы/scripts/cross-links на месте, в
  workflow-файлах нет секретов/реальных токенов (regex-проверка против
  известных паттернов — GitHub PAT, AWS key, private key block, Slack
  token, `${{ secrets. }}`), package.json валиден.
- **`docs/PRODUCTION_HARDENING.md`** §10: CodeQL/`npm audit` помечены ✅
  настроенными, добавлена ссылка на EXTERNAL_AUDIT.md.
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`** §F/§G: обновлены формулировки
  (external scanners — частично настроены), добавлена ссылка в «См. также».
- **`docs/DEPLOYMENT_RUNBOOK.md`**: добавлен pre-deploy пункт (свежий
  `npm audit` перед релизом) + ссылка в «См. также».
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, карта
  документации (§10), этот раздел.

**Не реализовано (по scope, намеренно):** изменения business logic/schema,
платные интеграции (Snyk/SonarCloud токены), OWASP ZAP в CI, E2E с живой
БД в CI, апгрейд postcss/xlsx (breaking/no-fix), PDF user manual,
WhatsApp Business API, payment gateway, full patient portal.

**E2E (после сессии):** `e2e-external-audit-setup-check` (новый, статический,
зелёный) + полный обязательный регрессионный набор (release-candidate,
production-hardening, deployment-readiness, demo-flow, admin,
platform-admin) — итоги см. в отчёте коммита.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.
schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: add external audit setup`.

## 7.34. Сессия 56 — итоги (CI Database / E2E Workflow Planning v1)

CI/release-сессия без новых бизнес-модулей, без изменений business
logic/schema. Цель — решить и подготовить план: как безопасно запускать
e2e в GitHub Actions с тестовой PostgreSQL БД (анонсировано как future
work в EXTERNAL_AUDIT.md §1.4, сессия 55).

**Находки (architecture note перед реализацией):**
1. Все 40 e2e-скриптов следуют единому паттерну: `E2E_BASE_URL` (дефолт
   `localhost:3000`), `SEED_DEMO_PASSWORD` (дефолт `Demo1234!`), реальный
   login через Prisma+bcrypt (не `AUTH_MOCK`), требуют, чтобы `prisma/seed.ts`
   уже отработал (ищут пациента «Rəşad Həsənov» по имени). 3 целевых
   smoke-скрипта (release-candidate/demo-flow/production-hardening) не
   зависят от `NODE_ENV`/`AUTH_MOCK` напрямую.
2. Эмпирически проверено: `next start` принудительно ставит
   `NODE_ENV=production` (выставляет `Secure` на session cookie), но
   собственный cookie-jar e2e-скриптов (`fetch()`, не браузер) не проверяет
   `Secure` — конфликта нет. `NEXT_PUBLIC_DEMO_MODE=true` +
   `SEED_DEMO_PASSWORD=Demo1234!` не конфликтует с demo-hint проверкой
   (сессия 52) — та проверяет только текст в HTML, не реальный логин.
3. Backgrounding `next start` в одном GitHub Actions job и опрос
   `/api/health/db` из последующего шага того же job — стандартный,
   безопасный паттерн (шаги делят одну VM).
4. Postgres service container — полностью ephemeral, изолирован в рамках
   одного runner'а, `DATABASE_URL` захардкожен как plaintext non-secret в
   YAML (не `secrets.*`) — физически невозможно случайно подключиться к
   production.

**Решение**: вариант A (GitHub Actions Postgres service container),
**manual-only** (`workflow_dispatch`), ограниченный набор (3 из 40
скриптов) — не вариант B (Neon test branch, требует платных секретов) и
не просто документация без workflow (вариант A признан безопасным).

**Изменения:**
- **`.github/workflows/e2e-smoke.yml`** (новый): `workflow_dispatch` только;
  `services: postgres:16`; `prisma migrate deploy` + `prisma db seed`;
  `npm run build` → `npm run start` в background (`nohup ... & disown`);
  shell-loop ожидание `/api/health/db` (без отдельного `wait-for-url`
  скрипта — простой `for`-loop с `curl`, как и рекомендовано); 3 smoke-чека
  (`e2e-release-candidate-check`, `e2e-demo-flow-check`,
  `e2e-production-hardening-check`). Только dummy/test env-значения, без
  `secrets.*`.
- **`docs/CI_E2E_STRATEGY.md`** (новый): текущее состояние CI, static vs
  DB-backed e2e, сравнение вариантов A/B/C с обоснованием выбора A
  manual-first, безопасные env-правила, как запустить локальный
  эквивалент, future path (несколько ручных прогонов → wider matrix →
  обязательный gate).
- **`scripts/e2e-ci-e2e-strategy-check.ts`** (новый, чисто статический —
  НЕ требует dev-сервера/БД): docs/workflow на месте, `workflow_dispatch`
  присутствует, НЕ триггерится на push/PR, Postgres service используется,
  нет секретов/production-подобных host (`neon.tech`/`amazonaws.com`/
  `.rds.`), dummy env-маркеры присутствуют, ограниченный (≤10) e2e-набор,
  упомянутые package scripts реально зарегистрированы, docs ссылаются на
  CI_E2E_STRATEGY.
- **`package.json`**: +1 script entry — `e2e-ci-e2e-strategy-check`.
- **`docs/EXTERNAL_AUDIT.md`** §1.4: помечено как реализовано (manual),
  ссылка на CI_E2E_STRATEGY.md.
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`** §G: новый пункт 8 (расширить
  CI e2e до обязательного gate — future), ссылка в «См. также».
- **`docs/DEPLOYMENT_RUNBOOK.md`**: ссылка на CI_E2E_STRATEGY.md (с
  пометкой — не путать с deploy-time smoke tests §5).
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, карта
  документации (§10), этот раздел.

**Не реализовано (по scope, намеренно):** push/PR-триггер для e2e-smoke
(остаётся manual до нескольких стабильных ручных прогонов), полный
40-скриптовый e2e-матрикс в CI, managed/внешняя CI-БД (вариант B),
изменения business logic/schema, PDF user manual, WhatsApp Business API,
payment gateway, full patient portal.

**E2E (после сессии):** `e2e-ci-e2e-strategy-check` (новый, статический,
зелёный) + полный обязательный регрессионный набор (external-audit-setup,
release-candidate, deployment-readiness, demo-flow) — итоги см. в отчёте
коммита. `e2e-smoke.yml` сам по себе не запускался локально в этой
сессии (GitHub Actions runner недоступен локально) — статическая
валидация workflow через `e2e-ci-e2e-strategy-check.ts` признана
достаточной (см. её же обоснование).

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый.
schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: document ci e2e strategy`.

## 7.35. Сессия 57 — итоги (GitHub Actions Smoke Run / CI Stabilization v1)

CI-сессия без новых бизнес-модулей, без изменений business logic/schema.
Цель — реально запустить `e2e-smoke.yml` (сессия 56) на GitHub Actions,
изучить логи, исправить CI/workflow если упал, либо зафиксировать
результат.

**Architecture note (перед реализацией):**
1. `gh` (GitHub CLI) **не установлен/не авторизован** в среде агента —
   проверено явно в обоих доступных shell (Bash и PowerShell), `gh` не
   найден ни там, ни там. Запустить `workflow_dispatch` или прочитать
   логи реального прогона из этой среды физически невозможно.
2. Вместо запуска — сделан тщательный построчный ручной разбор
   `e2e-smoke.yml` на предмет очевидных ошибок: цепочка env (workflow-level
   `env:` наследуется всеми step'ами, включая `Build` — критично для
   `NEXT_PUBLIC_DEMO_MODE`, которая встраивается в бандл на этапе build,
   не runtime); `prisma/schema.prisma` требует только `DATABASE_URL` (нет
   `shadowDatabaseUrl`/`directUrl`, который мог бы быть пропущен);
   `next start` форсирует `NODE_ENV=production` (ставит `Secure` на
   session cookie), но собственный fetch-based cookie-jar e2e-скриптов не
   браузер — `Secure` не enforced против него, конфликта нет;
   `SEED_DEMO_PASSWORD=Demo1234!` (workflow) совпадает с дефолтом всех
   e2e-скриптов; `lockfileVersion: 3` совместим с npm, идущим в Node 20
   (версия workflow). **Явных багов не найдено** при ручном разборе.
3. Единственный пробел — отсутствие `timeout-minutes` на job (дефолт
   GitHub — 360 минут) — исправлено проактивно (см. ниже), это явный
   «optional hardening» из scope сессии 57, не требует наблюдаемого сбоя.

**Изменения:**
- **`.github/workflows/e2e-smoke.yml`**: добавлен `timeout-minutes: 15`
  на job `e2e-smoke` — единственное изменение workflow (никаких других
  фиксов, т.к. реального сбоя не наблюдалось — нечего «лечить»).
- **`docs/CI_E2E_STRATEGY.md`**: новый §7 «Статус первого прогона» —
  статус **pending user-run**, явное объяснение почему (`gh` недоступен),
  точные 9 шагов для ручного запуска через GitHub UI (Actions → E2E Smoke
  → Run workflow → branch main → Run), что делать с результатом
  (✅ обновить раздел вручную / ❌ принести точный лог в следующую сессию).
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`** §G пункт 8: обновлён —
  статически проверен + hardening добавлен, но реальный прогон —
  pending user-run, ссылка на точные шаги.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, этот
  раздел.

**Не реализовано (по scope, намеренно, и не по выбору агента):**
реальный запуск/просмотр GitHub Actions прогона — требует `gh` CLI или
ручного действия владельца проекта через браузер, недоступно из этой
среды. Никаких фиксов в workflow кроме hardening — не наблюдалось
сбоя, который нужно было бы чинить. Изменения business logic/schema,
PDF user manual, WhatsApp Business API, payment gateway, full patient
portal — не делались (вне scope).

**Локальные проверки (после сессии):** `npx tsc --noEmit`, `npm run build`,
`e2e-ci-e2e-strategy-check`, `e2e-external-audit-setup-check`,
`e2e-release-candidate-check`, `e2e-deployment-readiness-check`,
`e2e-demo-flow-check` — итоги см. в отчёте коммита. **GitHub Actions сам
прогон — НЕ выполнялся и НЕ заявляется как пройденный.**

schema.prisma **не менялась**, migration **не требовалась**.

**Один коммит (один scope = один коммит):** `chore: stabilize e2e smoke workflow`.

## 7.36. Сессия 58 — итоги (GitHub Actions Smoke Fix / Migration Portability v1)

CI/migration-сессия без новых бизнес-модулей, без изменений
business logic/schema.prisma/permissions. Цель — диагностировать и
исправить реальный сбой `E2E Smoke` (пользователь запустил вручную на
`main`, commit `52586f5`) на шаге `npx prisma migrate deploy`.

**Ошибка из GitHub Actions**:

```text
Error: P3018
Migration name: 20260618100805_add_consumable_reversal
Database error: ERROR: index "treatment_consumable_usages_inventory_movement_id_idx" does not exist
```

**Root cause** (подтверждён построчным разбором миграций, не
предположением): `20260618100805_add_consumable_reversal` (10:08:05)
сортируется и применяется **раньше**, чем
`20260618120000_add_treatment_consumable_usage` (12:00:00) — но именно
вторая создаёт таблицу `treatment_consumable_usages` и нужный индекс.
4 команды в `100805` (`DROP INDEX`/`ALTER TABLE ADD COLUMN`/
`CREATE INDEX`/`RENAME INDEX`) ссылались на эту таблицу до её создания —
работает только если миграции уже отмечены применёнными в
`_prisma_migrations` (как на локальной dev-БД), и ломается на
абсолютно чистой БД (ephemeral CI Postgres), которая реплеит историю
с нуля в порядке имён папок.

**Почему не просто `IF EXISTS`-guard**: это не «безопасно пропустить
устаревший объект» случай — если эти 4 команды молча не выполнятся на
чистой БД, финальная схема НАВСЕГДА останется без колонок
`is_reversed`/`reversal_movement_id`/`reversal_reason`/`reversed_at`/
`reversed_by_id`, которые требует `schema.prisma` — это была бы
настоящая порча данных, не фикс.

**Фикс**: 4 проблемные команды перенесены **слово в слово** (тот же SQL-
текст, тот же относительный порядок) из `20260618100805_add_consumable_reversal/migration.sql`
в конец `20260618120000_add_treatment_consumable_usage/migration.sql`
(после создания таблицы/индексов/FK). Остальные команды в `100805`
(alter enum, правки `supplier_order_items`/`service_consumable_templates`)
проверены — все зависят только от миграций, применяемых раньше
(`20260617130000`, `20260617160000`), не тронуты. **Никакой новой
миграции, никаких изменений schema.prisma.**

**Проверено локально перед коммитом** (не просто статически):
1. `npx prisma validate` → схема валидна.
2. Создана **отдельная временная** Postgres-БД на той же портативной
   локальной инсталляции (`dental_pro_crm_ci_fresh_test`) — основная
   dev-БД НЕ тронута.
3. На ней с абсолютного нуля: `npx prisma migrate deploy` — все 16
   миграций применились без ошибок (включая обе спорные).
4. `npx prisma db seed` — прошёл полностью (демо-клиника, пациенты,
   приёмы, материалы, протоколы — без ошибок).
5. `\d treatment_consumable_usages` — ручная проверка структуры:
   все 5 reversal-колонок, 4 non-unique индекса
   (`clinic_id`/`treatment_item_id`/`inventory_item_id`/`is_reversed`),
   единственный `UNIQUE` на `inventory_movement_id` (без избыточного
   отдельного индекса) — 1:1 совпадает с `schema.prisma`.
6. Временная БД удалена после проверки.

Это воспроизводит ровно то, что делает CI (`prisma migrate deploy` →
`prisma db seed` на ephemeral Postgres), максимально близко к реальному
GitHub Actions окружению, доступному из среды агента.

**Изменения:**
- **`prisma/migrations/20260618100805_add_consumable_reversal/migration.sql`**:
  удалены 4 команды (перенесены, не удалены безвозвратно — см. ниже),
  добавлен комментарий с объяснением и ссылкой на этот раздел.
- **`prisma/migrations/20260618120000_add_treatment_consumable_usage/migration.sql`**:
  те же 4 команды добавлены в конец файла (после исходного содержимого),
  с комментарием-объяснением.
- **`scripts/e2e-ci-e2e-strategy-check.ts`**: +2 проверки — workflow
  использует `prisma migrate deploy` (не `db push`); workflow НЕ
  использует `prisma db push`.
- **`docs/CI_E2E_STRATEGY.md`**: новый §8 — root cause, фикс, локальная
  проверка fresh-DB, что осталось (re-run на GitHub Actions).
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, этот
  раздел.

**GitHub Actions**: `gh` CLI всё ещё недоступен в среде агента (повторно
проверено в обоих shell) — повторный прогон **pending user-run**,
результат НЕ заявляется как пройденный. Точные шаги — CI_E2E_STRATEGY.md
§7 (без изменений с сессии 57).

**Не реализовано (по scope, намеренно):** новая corrective-миграция (не
требуется — реордеринг существующих файлов достаточен и менее
рискован), `prisma db push` в CI (запрещено правилами сессии), реальный
прогон GitHub Actions (недоступен из среды агента), изменения business
logic/schema, PDF user manual, WhatsApp Business API, payment gateway,
full patient portal.

**Локальные проверки (после сессии):** `npx prisma validate`,
`npx prisma generate`, fresh-DB `migrate deploy` + `db seed` (см. выше),
`npx tsc --noEmit`, `npm run build`, `e2e-ci-e2e-strategy-check`,
`e2e-external-audit-setup-check`, `e2e-release-candidate-check`,
`e2e-deployment-readiness-check`, `e2e-demo-flow-check` — итоги см. в
отчёте коммита.

schema.prisma **не менялась**, новая migration **не создавалась**
(существующие 2 файла отредактированы для portability).

**Один коммит (один scope = один коммит):** `fix: make consumable reversal migration portable`.

## 7.37. Сессия 59 — итоги (GitHub Actions Production Hardening E2E Fix v1)

CI/e2e-debug сессия без новых бизнес-модулей, без изменений business
logic/schema. Цель — диагностировать и исправить сбой
`e2e-production-hardening-check` (assertion A15) на втором ручном
прогоне `E2E Smoke` (после фикса миграций в сессии 58).

**Прогресс второго прогона** (`main`, commit `febff08`): migrate deploy
✅, seed ✅, build ✅, app start ✅, `/api/health/db` ✅,
`e2e-release-candidate-check` ✅, `e2e-demo-flow-check` ✅,
`e2e-production-hardening-check` — **37 passed, 1 failed (A15)**.

**Расследование**: локальная репродукция (`npm run e2e-production-hardening-check`)
— **42/42, ни одного флейка**, включая A15, на нескольких прогонах.
Построчный разбор `getPublicResponseLinkState()`
(`lib/patient-response.ts`) и пути рендера feedback-ссылки без
привязанного приёма (`appointmentId: null`) — реального логического
бага не найдено. `getDict()` (`lib/i18n.ts`) полностью статичен (всегда
AZ) — env-зависимость текста исключена. Точную причину разницы
local vs. CI **доказать не удалось** (нет доступа к полным логам CI,
`gh` CLI всё ещё недоступен).

**Фикс (test-only, без изменений business logic/route/schema)**:
старая проверка A15 сверяла `html.includes("Rəy bildirin")`
(переведённый заголовок страницы). У `FeedbackForm`
(`components/patient-response/FeedbackForm.tsx`) уже есть собственный
структурный маркер `data-e2e-marker="feedback-form"` на самой `<form>`
— тот же паттерн, что уже используется для
`link-used`/`link-expired`/`patient-response-card` (см. §4
«E2E-техника» ниже). A15 переключён на этот маркер — точнее проверяет
именно «форма отзыва отрендерилась», как заявлено в названии чека.
Добавлена диагностика на failure: status, живое состояние ссылки в БД,
первые 400 символов тела ответа — для конкретных улик, если флейк
повторится.

**Изменения:**
- **`scripts/e2e-production-hardening-check.ts`**: A15 переключён на
  `data-e2e-marker="feedback-form"` вместо переведённого текста
  заголовка; добавлена diagnostics-печать при failure (status/dbLink/
  bodyStart).
- **`docs/CI_E2E_STRATEGY.md`**: новый §9 — прогресс второго прогона,
  расследование, фикс, честная оговорка про недоказанную root cause.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, этот
  раздел.

**Не реализовано (по scope, намеренно, и не по выбору агента):**
изменения `lib/patient-response.ts`/`app/r/[token]/page.tsx`/
`FeedbackForm.tsx` (не найдено доказанной ошибки — менять было бы
нарушением правила «не менять business logic без доказанной реальной
ошибки»); реальный повторный прогон GitHub Actions (недоступен из
среды агента); ослабление/удаление A15; retry-логика без доказанной
необходимости; изменения business logic/schema, PDF user manual,
WhatsApp Business API, payment gateway, full patient portal.

**Локальные проверки (после сессии):** `npx prisma validate`,
`npx prisma generate`, `npx tsc --noEmit`, `npm run build`,
`e2e-production-hardening-check` (42/42, несколько прогонов),
`e2e-ci-e2e-strategy-check`, `e2e-external-audit-setup-check`,
`e2e-release-candidate-check`, `e2e-deployment-readiness-check`,
`e2e-demo-flow-check` — итоги см. в отчёте коммита.

schema.prisma **не менялась**, migration **не создавалась**.

**Один коммит (один scope = один коммит):** `fix: stabilize feedback token hardening check`.

## 7.38. Сессия 60 — итоги (Real Deploy Environment Verification v1)

Verification-сессия без новых бизнес-модулей, без изменений business
logic/schema. Цель — проверить, готова ли документация deploy/demo
окружения теперь, когда CI полностью зелёный (CI ✅, CodeQL ✅,
E2E Smoke #3 ✅ на `main`, commit `0a7131d`).

**Находки**: техническая часть документации (`DEPLOYMENT.md`,
`FREE_DEMO_DEPLOY.md`, `DEMO.md`, `.env.example`, package.json scripts
`prod:migrate`/`prod:update`/`demo:deploy:init`/`db:seed`,
`/api/health/db` route) сверена с реальным кодом — расхождений не
найдено, 1:1 соответствует. **Единственное расхождение**: документация
CI-статуса (`CI_E2E_STRATEGY.md` §9, `RELEASE_CANDIDATE_CHECKLIST.md`
§G.8) была помечена «pending user-run»/«pending user re-run», хотя
третий прогон `E2E Smoke` фактически прошёл полностью зелёным — docs
не были обновлены после подтверждения пользователем (ожидаемо: предыдущие
сессии явно фиксировали «обновление этого статуса требует ручного шага
владельца проекта, т.к. среда агента не может это подтвердить
самостоятельно» — этот шаг и был сделан в сессии 60, на основании
сообщённого пользователем результата).

**Изменения (docs only):**
- **`docs/CI_E2E_STRATEGY.md`**: новый §10 — третий прогон зафиксирован
  как ✅ passed (commit `0a7131d`, все 3 smoke-набора зелёные, включая
  A15 после фикса сессии 59); §6 п.1 помечен ✅ минимально выполненным.
- **`docs/RELEASE_CANDIDATE_CHECKLIST.md`** §G.8: статус обновлён с
  «pending user-run» на ✅ подтверждённый зелёный прогон.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, этот
  раздел.

**Не реализовано (по scope, намеренно):** изменения кода/business
logic/schema (реального deploy-only бага не найдено — техническая
документация уже соответствовала коду); новые e2e/helper-скрипты (все
нужные проверки уже покрыты `e2e-deployment-readiness-check`/
`e2e-ci-e2e-strategy-check`/`e2e-external-audit-setup-check`); seed
против production БД (не запускался — не подтверждено, что есть
disposable demo БД); PDF user manual, WhatsApp Business API, payment
gateway, full patient portal.

**Локальные проверки (после сессии):** `npx prisma validate`,
`npx prisma generate`, `npx tsc --noEmit`, `npm run build`,
`e2e-deployment-readiness-check`, `e2e-ci-e2e-strategy-check`,
`e2e-external-audit-setup-check` — итоги см. в отчёте коммита.

schema.prisma **не менялась**, migration **не создавалась**.

**Один коммит (один scope = один коммит):** `docs: prepare real deploy verification`.

## 7.39. Сессия 62 — итоги (Demo Response Link Fix / Secret Rotation v1)

Verification-сессия без новых бизнес-модулей, без изменений business
logic/schema. Контекст: пользователь сообщил, что подготовленная ссылка
отзыва пациента (`/r/[token]`) не открывалась, плюс часть Neon DB URL
случайно попала на экран — требовалась ротация секрета.

**Расследование**: построчно проверены `buildPatientResponseUrl`/
`getAppBaseUrl` (`lib/patient-response.ts`), `prepareFeedbackLinkAction`
(`lib/actions/patient-feedback.ts`), `middleware.ts` (`/r` bypass) —
логических багов не найдено; `/r/bad-token` уже был подтверждён
рабочим на этом деплое в сессии 61. Найдена реальная проблема **в
документации**: `docs/FREE_DEMO_DEPLOY.md` (основной Vercel-гайд) не
включал `NEXT_PUBLIC_APP_URL` в таблицу env vars, а
`docs/PATIENT_RESPONSE_LINKS.md`/`.env.example` описывали её как нужную
«только за нестандартным proxy/CDN» — формулировка, под которую сам
Vercel формально подходит, но не звучала как явная рекомендация.

**Ротация секрета** (выполнена пользователем): пароль Neon-роли сброшен,
`DATABASE_URL` обновлён в Vercel, `NEXT_PUBLIC_APP_URL=https://dental-pro-crm.vercel.app`
добавлен, Production redeploy выполнен.

**Верификация после redeploy** (мной, через публичные HTTP-запросы, без
секретов): `/api/health` ✅, `/api/health/db` ✅ (новый пароль работает),
demo-логин (`admin@demo.dentalpro.az`/`admin123`) ✅, **сгенерирована
свежая feedback-ссылка** через demo UI (форма на карточке процедуры
пациента Rəşad) — текст подготовленного уведомления содержит корректный
абсолютный URL `https://dental-pro-crm.vercel.app/r/<token>`; сама
публичная страница по этой ссылке → 200, форма отзыва
(`data-e2e-marker="feedback-form"`), без утечки UUID/финансовых/
документных терминов ✅. `/r/bad-token` — generic expired-state,
без утечки ✅.

**Честно**: точную причину ИСХОДНОГО сбоя (тот самый, о котором сообщил
пользователь) подтвердить не удалось — исходный токен недоступен для
повторной проверки. Подтверждено только, что СЕЙЧАС, с явным
`NEXT_PUBLIC_APP_URL`, свежая ссылка работает корректно.

**Изменения (docs only):**
- **`docs/FREE_DEMO_DEPLOY.md`**: `NEXT_PUBLIC_APP_URL` добавлен в
  таблицу env vars §5 как обязательный для Vercel, с пояснением.
- **`docs/PATIENT_RESPONSE_LINKS.md`**: уточнена формулировка — Vercel
  явно назван «нестандартным proxy/CDN»-случаем, переменную задавать
  всегда, не опционально.
- **`.env.example`**: аналогичное уточнение в комментарии к
  `NEXT_PUBLIC_APP_URL`.
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, этот
  раздел.

**Не реализовано (по scope, намеренно):** изменения кода (`lib/patient-response.ts`,
`lib/actions/patient-feedback.ts`, `middleware.ts`) — реального кодового
бага не найдено, код прошёл построчную проверку и эмпирическую
верификацию без замечаний; новые функции, PDF user manual, изменения
inventory/medicine-функциональности (запланированы как отдельная
будущая сессия, не эта).

schema.prisma **не менялась**, migration **не создавалась**.

**Один коммит (один scope = один коммит):** `docs: clarify deployed response link configuration`.

## 7.40. Сессия 63 — итоги (Inventory / Medicine Units Audit & Architecture v1)

Audit-сессия без изменений кода/схемы/бизнес-логики. Цель — провести
технический и продуктовый аудит модели склада/расходников/лекарств перед
реализацией расширенных требований пользователя (категории, единицы
измерения box→pcs/cartridge/ml, default usage templates, ручная
коррекция ассистентом, ежедневный отчёт врача).

**Главный вывод**: инфраструктура для большинства требований **уже
существует и протестирована** (209+ e2e-проверок, сессии 28-40) —
`InventoryItem.purchaseUnit/purchaseToBaseFactor/doseToBaseFactor`,
`ServiceConsumableTemplate` (default usage, allowOverride, isRequired),
`TreatmentConsumableUsage` (фактическое списание + reversal audit),
permissions, tenant isolation, negative-stock protection — всё на месте.
Реально отсутствует только: «doctor daily report» (пациенты/процедуры/
доход/списания за день по врачу — есть только cost-report по периоду,
не по дню/доходу) и структурированные type/strength-метаданные материала
(опционально).

**Реальная находка** (не баг кода, баг конфигурации данных): demo-seed
(`prisma/seed.ts:611-657`) создаёт перчатки/маски с `unit: "qutu"`
(коробка как БАЗОВАЯ единица склада) — списать «4 перчатки на процедуру»
технически невозможно, поскольку остаток считается в коробках, не в
штуках/парах. Механизм конверсии (`purchaseUnit`/`purchaseToBaseFactor`)
работает правильно везде, где настроен — просто ни один живой demo-пример
не показывает его настроенным верно.

**Веб-исследование** (только как inventory-метаданные, не клинические
рекомендации): анестезирующий картридж lidocaine/articaine ≈ 1.7-1.8 мл;
etch-гель — шприцы 1.2-5 мл; перчатки/маски/иглы/слюноотсосы — упаковки
по 50-100 шт, нагрудники — по 500 шт (источники — см.
[INVENTORY_MEDICINE_UNITS_V2_PLAN.md](INVENTORY_MEDICINE_UNITS_V2_PLAN.md) §6).

**Изменения (docs only):**
- **`docs/INVENTORY_MEDICINE_UNITS_V2_PLAN.md`** (новый): полный аудит
  (что есть/что отсутствует/где опасно), предлагаемая модель данных
  (минимальный вариант без миграции + опциональный additive-вариант),
  предлагаемый UX, план совместимости, разбивка на сессии 64-66 с
  оценкой риска, список рисков, рекомендация — начинать с Session 64
  (demo data fix, без миграции схемы).
- **`docs/SESSION_HANDOFF.md`** (этот файл): обновлён заголовок, карта
  документации (§10), этот раздел.

**Не реализовано (по scope, намеренно):** любые изменения кода/схемы/
миграции (явно запрещено в этой сессии — "audit first"); demo-seed
unit-фикс (запланирован как Session 64); doctor daily report
(запланирован как Session 65); itemType/strengthNote миграция
(опциональная Session 66, только при подтверждённой потребности); PDF
user manual, изменения business logic.

**Локальные проверки (после сессии, т.к. изменены только .md-файлы):**
`npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`,
`npm run build` — итоги см. в отчёте коммита.

schema.prisma **не менялась**, migration **не создавалась**.

**Один коммит (один scope = один коммит):** `docs: plan inventory medicine units v2`.

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

## 7.24. Сессия 45 — итоги (Patient Feedback / Review Flow v1)

Третий ранее зарезервированный `LinkPurpose` (`feedback`, существовал в
enum с самой первой миграции, как `confirm_appointment`/`reschedule_offer`
до своих сессий) — теперь реальный поток: после завершённого приёма/
процедуры сотрудник готовит безопасную ссылку, пациент без логина ставит
оценку 1–5 + опциональный комментарий. **Никакой публикации наружу,
никакого Google Reviews/NPS, никакой автоотправки.** Подробности —
**[PATIENT_FEEDBACK.md](PATIENT_FEEDBACK.md)**.

**Изменения:**
- **`prisma/schema.prisma`**: новая модель `PatientFeedback` (`clinicId`,
  `patientId`, `appointmentId?`, `treatmentItemId?`, `responseLinkId`
  (unique FK на `PatientResponseLink`), `rating` (SmallInt 1–5), `comment?`,
  `submittedAt`); `+1` значение в `NotificationType`
  (`feedback_received`); back-relации (`feedbacks`/`patientFeedbacks`)
  добавлены в `Clinic`/`Patient`/`Appointment`/`TreatmentItem`, и
  виртуальная `PatientResponseLink.feedback PatientFeedback?` (без новой
  колонки на `patient_response_links` — Prisma требует обе стороны связи,
  реальная FK живёт на стороне `patient_feedbacks`). Migration
  `20260622000000_add_patient_feedback` — новая таблица, сгенерирована
  через `prisma migrate diff` против реальной БД (тот же workaround
  shadow-DB, что в Session 43/44). **`LinkPurpose.feedback` — без
  миграции**, существовал с `init`.
- **`lib/tenant.ts`**: `"PatientFeedback"` добавлен в `TENANT_MODELS`.
- **`lib/patient-response.ts`**: `getOrCreateFeedbackLink` (переиспользует
  активную ссылку **той же сущности** — по `appointmentId`-колонке либо
  по `treatmentItemId` внутри `response`, а не по пациенту целиком);
  `PublicResponseLinkState`/`getPublicResponseLinkState` переработаны —
  `doctorName`/`startsAt` стали nullable, `purpose` теперь есть и в
  `kind: "used"` (единственное отступление от «used/expired полностью
  generic для всех purpose» — для feedback показывается «Rəy artıq
  göndərilib» по прямому требованию ТЗ; `expired`/`not_found` остались
  generic).
- **`lib/validation/patient-feedback.ts`** (new), **`lib/patient-feedback.ts`**
  (new, queries: `listPatientFeedback`, `listRecentFeedback`),
  **`lib/actions/patient-feedback.ts`** (new: `prepareFeedbackLinkAction`,
  `patients.manage` — выбрано вместо `appointments.manage`/
  `treatments.manage`, т.к. отзыв не привязан к одному домену).
  **`lib/actions/patient-response.ts`**: + `submitFeedbackAction` (public).
- **`lib/communications.ts`**: + `feedbackRequestMessage()`.
  **`lib/constants.ts`**: + `COMMUNICATION_TYPE_META.feedback_received`.
  **`lib/notifications.ts`**: + `TYPE_PERMISSION.feedback_received` (без
  этого tenant-level staff-уведомление было бы невидимо в bell).
  **`lib/treatments.ts`**: `itemInclude.patient` — добавлен `phone`
  (нужен для inline WhatsApp-кнопки на карточке процедуры).
- **`components/patient-response/FeedbackForm.tsx`** (new, public,
  звёзды-рейтинг 1–5) + **`app/r/[token]/page.tsx`** (branch для
  `purpose === "feedback"`, guard для nullable полей).
  **`components/feedback/FeedbackRatingBadge.tsx`** (new),
  **`components/patients/PatientFeedbackBlock.tsx`** (new, переиспользуется
  на карточке пациента и на `/feedback`).
- **`components/treatments/TreatmentItemCard.tsx`**/`TreatmentItemsList.tsx`:
  + `feedbackLabels` — inline `WhatsAppActionButton` (не отдельная
  страница, как у recall — у feedback нет полей формы) при `status ===
  "done"`. **`app/(dashboard)/patients/[id]/page.tsx`**: + блок
  «Son rəylər» + inline кнопка на завершённых приёмах в «Son qəbullar».
  **`app/(dashboard)/feedback/page.tsx`** (new) + wiring в
  `treatments/page.tsx`/`patients/[id]/treatments/page.tsx`.
- **`i18n/az.ts`**: новая секция `patientFeedback.*`.
- **docs**: new `PATIENT_FEEDBACK.md`; обновлены `PATIENT_RESPONSE_LINKS.md`,
  `COMMUNICATIONS.md`, этот файл.

**Найдено по ходу, не исправлено (чужой код, отдельная задача)**:
`reschedule_offer` (Session 43) создаёт tenant-level staff-уведомление, но
никогда не был добавлен в `lib/notifications.ts:TYPE_PERMISSION` — невидим
в bell с Session 43. Не трогалось в этой сессии (вне scope).

**E2E (после сессии):** `e2e-patient-feedback-check` 40/40,
`e2e-patient-response-links-check` 42/42,
`e2e-patient-reschedule-options-check` 39/39, `e2e-recall-tasks-check`
39/39, `e2e-communications-check` 40/40, `e2e-notifications-check` 17/17,
`e2e-appointments-check` 28/28, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20, `e2e-treatment-protocols-check` 31/31,
`e2e-consumables-audit-visibility-check` 28/28.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (`/feedback`
присутствует).

**Не реализовано (по scope):** WhatsApp Business API, автоматическая
отправка, публичная страница отзывов, Google Reviews integration, NPS/
аналитика, агрегация рейтинга, full patient portal.

## 7.23. Сессия 44 — итоги (Treatment Recall / 6-Month Checkup v1)

Закрывает разрыв между «лечение завершено» и «через N времени нужен
контроль» — новая модель `RecallTask` (НЕ приём, отдельная задача-
напоминание), очередь `/recalls`, WhatsApp click-to-chat подготовка
сообщения. **Никакого автосоздания appointment, никакой автоотправки,
никакого cron.** Подробности — **[RECALL_TASKS.md](RECALL_TASKS.md)**.

**Изменения:**
- **`prisma/schema.prisma`**: новая модель `RecallTask` (`clinicId`,
  `patientId`, `doctorId?`, `treatmentItemId?`, `serviceId?`, `dueDate`
  (Date), `title`, `note?`, `status` (`RecallStatus`: pending/prepared/
  scheduled/dismissed), `preparedAt?`, `scheduledAppointmentId?`,
  `createdById` — обычная колонка без Prisma-relation, как
  `Appointment.createdById`); back-relации `recallTasks RecallTask[]`
  добавлены в `Clinic`/`Patient`/`Doctor`/`TreatmentItem`/`Service`/
  `Appointment`. Migration `20260621000000_add_recall_tasks` (новая
  таблица — сгенерирована через `prisma migrate diff` против реальной БД,
  `migrate dev` падает на shadow-DB из-за несвязанной исторической
  миграции, тот же workaround, что в Session 43).
- **`lib/tenant.ts`**: `"RecallTask"` добавлен в `TENANT_MODELS`.
- **`lib/recall-tasks.ts`** (new): `listRecallQueue`, `getRecallTaskForUser`,
  `countDueRecalls`, `classifyRecallUrgency` (overdue/`due_soon`/upcoming,
  14-дневное окно фиксировано в v1). Scope — тот же `patientScopeWhere`,
  что у `TreatmentItem`.
- **`lib/actions/recall-tasks.ts`** (new): `createRecallTaskAction`,
  `prepareRecallMessageAction`, `markRecallScheduledAction`,
  `dismissRecallAction` — все на `treatments.manage`.
- **`lib/validation/recall-tasks.ts`** (new), **`lib/communications.ts`**:
  + `recallMessage()`. **`lib/constants.ts`**: + `RECALL_STATUS_META`,
  + `COMMUNICATION_TYPE_META.repeat_visit_reminder` (переиспользует
  enum-значение, существовавшее с самой первой миграции, но не
  использовавшееся — без новой миграции для `NotificationType`).
- **`components/treatments/TreatmentItemCard.tsx`** (+`TreatmentItemsList.tsx`):
  новая иконка-ссылка `recallLabel` → `/treatments/[id]/recall`, видна
  только при `status === "done"`.
- **`app/(dashboard)/treatments/[id]/recall/page.tsx`** + new
  **`components/treatments/RecallCreateForm.tsx`**: preset 7g/30g/6ay
  (`setMonth`, календарно корректно) + своя дата, заголовок по умолчанию
  `"{xidmət} üzrə kontrol"`.
- **`app/(dashboard)/recalls/page.tsx`** + new
  **`components/recalls/{RecallQueuePanel,RecallStatusBadge,RecallSimpleActionButton}.tsx`**:
  очередь pending/prepared, WhatsApp-кнопка (переиспользует
  `WhatsAppActionButton` — `prepareRecallMessageAction` совпадает по форме
  с `CommunicationFormState`), mark-scheduled/dismiss.
- **`components/dashboard/RecallSummaryPanel.tsx`** + dashboard wiring:
  тизер (overdue/due-soon счётчики) при `treatments.view`. Без нового
  пункта в sidebar (`nav.ts` жёстко связывает 1 пункт = 1 permission-модуль,
  заводить отдельный модуль только для меню — overbuild).
- **`i18n/az.ts`**: `treatments.recall.*` (staff-форма, очередь, ошибки).
- **docs**: new `RECALL_TASKS.md`; обновлены `COMMUNICATIONS.md`, этот файл.

**E2E (после сессии):** `e2e-recall-tasks-check` 39/39,
`e2e-communications-check` 40/40, `e2e-appointments-check` 28/28,
`e2e-notifications-check` 17/17, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20, `e2e-treatment-protocols-check` 31/31,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-consumables-audit-visibility-check` 28/28 (последние три —
регрессия `TreatmentItemCard`, общий компонент).

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (`/recalls`,
`/treatments/[id]/recall` присутствуют).

**Не реализовано (по scope):** WhatsApp Business API, автоотправка,
cron/queue automation, recurring/infinite schedules, advanced treatment
protocol engine, автоматическое создание/выбор appointment при mark-
scheduled (`scheduledAppointmentId` зарезервирован), patient self-booking,
feedback/review flow.

## 7.22. Сессия 43 — итоги (Patient Reschedule Options Flow v1)

Закрывает мёртвый конец Session 41: `reschedule_requested` теперь приводит к
реальному действию. Сотрудник предлагает 2–3 конкретных времени, пациент
выбирает одно по отдельной безопасной публичной ссылке — приём переносится
автоматически. **Пациент никогда не видит полный календарь врача.**
**Без новой таблицы (additive enum-миграция), без авто-отправки, без cron.**
Подробности — **[PATIENT_RESCHEDULE_OPTIONS.md](PATIENT_RESCHEDULE_OPTIONS.md)**.

**Изменения:**
- **`prisma/schema.prisma` + migration `20260620000000_add_reschedule_offer`**:
  +1 значение в `LinkPurpose` (`reschedule_offer`) и в `NotificationType`
  (`reschedule_offer`). Никаких новых таблиц/колонок.
- **`lib/patient-response.ts`**: `RescheduleOption` тип,
  `createOrReplaceRescheduleOptionsLink` (отзывает прежние активные
  reschedule_offer-ссылки приёма, создаёт новую с вариантами в `response`),
  `parseRescheduleOptions` (защитный парсинг); `PublicResponseLinkState` +
  `getPublicResponseLinkState` теперь возвращают `purpose` и (для
  reschedule_offer) `options`.
- **`lib/validation/reschedule-options.ts`** (new): схемы staff-формы
  (`proposeRescheduleOptionsSchema`, 2 обязательных + 1 опциональный
  вариант) и public-выбора (`selectRescheduleOptionSchema`).
- **`lib/actions/reschedule-options.ts`** (new): `proposeRescheduleOptions`
  — `appointments.manage`, scope приёма, `status===reschedule_requested`,
  телефон, валидация вариантов (≥2 future без дублей; >3 структурно
  невозможно — форма не даёт 4-е поле), готовит WhatsApp-текст + лог.
  Appointment не двигает.
- **`lib/actions/patient-response.ts`**: + `selectRescheduleOptionAction`
  (public, без сессии) — single-use compare-and-swap (как
  `submitPatientResponseAction`), переносит приём
  (`startsAt`/`endsAt`=выбранный вариант, `status="scheduled"`,
  `patientResponseStatus="pending"`), пишет историю + staff-уведомление.
- **`lib/communications.ts`**: `rescheduleOptionsMessage`;
  `ReminderCandidate.rescheduleOptionsSent` — индикатор для
  `responded_reschedule` строк на dashboard.
- **`lib/appointments.ts`**: `listPatientAppointments` возвращает
  `rescheduleOptionsSent` для блока на карточке пациента.
- **`lib/constants.ts`**: `COMMUNICATION_TYPE_META.reschedule_offer`.
- **`components/appointments/RescheduleOptionsForm.tsx`** (new): staff-форма
  на карточке пациента (видна только при `reschedule_requested` +
  `appointments.manage`).
- **`components/patient-response/RescheduleOptionsSelectionForm.tsx`**
  (new): public-выбор варианта на `/r/[token]`.
- **`app/r/[token]/page.tsx`**: branching по `purpose` (4-кнопочная форма
  Session 41 vs новая форма вариантов), заголовок страницы тоже меняется.
- **`app/(dashboard)/patients/[id]/page.tsx`**: блок «Pasiyent vaxt
  dəyişmək istəyir» рядом с существующей WhatsApp-кнопкой напоминания.
- **`components/dashboard/TodayRemindersPanel.tsx`**: индикатор «Vaxt
  variantları göndərilib» для `responded_reschedule`-строк.
- **`i18n/az.ts`**: секция `rescheduleOptions.{staff,public}`.
- **`scripts/e2e-patient-reschedule-options-check.ts`** (new, 39 проверок)
  + npm-скрипт.
- **docs**: new `PATIENT_RESCHEDULE_OPTIONS.md`; обновлены
  `PATIENT_RESPONSE_LINKS.md`, `COMMUNICATIONS.md`, этот файл.

**Почему `status="scheduled"` после выбора, не `"confirmed"`:** пациент
выбрал новое время, но явку не подтверждал — `confirmed` создавал бы
ложное впечатление подтверждения. Приём на новом времени естественно
попадает в reminder-очередь Session 42 как обычный `due`-кандидат.

**E2E (после сессии):** `e2e-patient-reschedule-options-check` 39/39,
`e2e-patient-response-links-check` 42/42,
`e2e-appointment-reminder-scheduling-check` 28/28,
`e2e-communications-check` 40/40, `e2e-notifications-check` 17/17,
`e2e-appointments-check` 28/28, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (`/r/[token]` и
`/patients/[id]` чуть выросли в размере — новые компоненты, маршруты не
менялись).

**Не реализовано (по scope):** WhatsApp Business API, автоматическая
отправка, полный календарь/доступность врача на публичной странице,
сложный drag/drop календарь, advanced availability engine, выбор другого
врача при reschedule, feedback/review flow, 6-month recall, scheduler/cron.

## 7.21. Сессия 42 — итоги (Appointment Reminder Scheduling Rules v2)

Делает очередь напоминаний на dashboard честной: `reminder_hours_before`
(clinic setting, существовал с Session 13.5, но никогда не читался) теперь
реально задаёт окно очереди. **Без миграции, без авто-отправки, без cron.**
Подробности — **[APPOINTMENT_REMINDER_SCHEDULING.md](APPOINTMENT_REMINDER_SCHEDULING.md)**.

**Изменения:**
- **`lib/communications.ts`**: `listReminderCandidates` переписан — окно
  `[сейчас, сейчас + reminderHoursBefore]` вместо хардкода today/tomorrow;
  возвращает `ReminderQueue { candidates, reminderHoursBefore, notDueCount }`;
  классификация `ReminderStatus` (`due`/`prepared`/`responded_confirmed`/
  `responded_late`/`responded_reschedule`/`responded_cancelled`) считается
  прямо из `Appointment.status` (Session 41 уже приводит его к нужным
  значениям через `RESPONSE_TO_STATUS`); пациенты без телефона больше не
  вырезаются из списка — просто WhatsApp-кнопка отключена.
- **`components/dashboard/TodayRemindersPanel.tsx`**: переписана —
  3 группы (due/prepared/responded), подсказка окна + «Avtomatik
  göndərilmir», WhatsApp-кнопка не рендерится для `responded_*` строк
  («не подталкивать к повторной отправке»).
- **`app/(dashboard)/dashboard/page.tsx`**: wiring под новый `ReminderQueue`.
- **`i18n/az.ts`**: панель переименована «Bugünkü xatırlatmalar» →
  «Qəbul xatırlatmaları» (заголовок больше не привязан к «сегодня»);
  новые секции `communications.reminders.{groups,badges}`; уточнена копия
  `settings.params.reminderHours`/`reminderHoursHint` (явно: окно ≠
  авто-отправка).
- **`components/settings/ClinicParamsForm.tsx`**: hint-строка под полем
  `reminderHoursBefore`.
- **`scripts/e2e-appointment-reminder-scheduling-check.ts`** (new, 28
  проверок) + npm-скрипт.
- **`scripts/e2e-communications-check.ts`**: 3 литеральные assert'ы
  синхронизированы с переименованием панели/бейджа (`Bugünkü
  xatırlatmalar`→`Qəbul xatırlatmaları`, `Hazırlanıb`→`Mesaj hazırlanıb`) —
  это не seed-staleness, а прямое следствие copy-изменения этой сессии.
- **docs**: new `APPOINTMENT_REMINDER_SCHEDULING.md`; обновлены
  `COMMUNICATIONS.md`, `PATIENT_RESPONSE_LINKS.md`, этот файл (§6 —
  закрыт известный риск «reminder_hours_before не читается»).

**E2E (после сессии):** `e2e-appointment-reminder-scheduling-check` 28/28,
`e2e-patient-response-links-check` 42/42, `e2e-communications-check` 40/40,
`e2e-notifications-check` 17/17, `e2e-appointments-check` 28/28,
`e2e-demo-flow-check` 11/11, `e2e-admin-check` 36/36,
`e2e-platform-admin-check` 42/42, `e2e-dashboard-check` 20/20.

`npx tsc --noEmit` → 0 ошибок. `npm run build` → чистый (`/r/[token]`
присутствует, маршруты не изменились).

**Не реализовано (по scope):** WhatsApp Business API, автоматическая
отправка, cron/queue, точный «день назад в 12:00» auto-send (текущая v2 —
hours-before окно, не календарный расчёт), выбор слота пациентом при
reschedule (Session 43), feedback/review flow, 6-month recall.

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

**После Session 63**: следующий шаг —
[INVENTORY_MEDICINE_UNITS_V2_PLAN.md](INVENTORY_MEDICINE_UNITS_V2_PLAN.md) §5,
**Session 64 (demo data fix, без миграции схемы)**: пересоздать demo
`InventoryItem` для перчаток/масок/игл/слюноотсосов с правильными base/
purchase units, построчно проверив зависимые e2e перед правкой. После
64-65 (Doctor Daily Report) — см. тот же документ §7 для опциональной
Session 66.

**После Session 53** (более старый источник): прежний приоритет —
[RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) §G
(final deploy verification → backup/monitoring → PDF user manual →
опциональный security-аудит → real clinic pilot). Остальной список ниже —
более старый backlog, частично уже реализован в сессиях 36+ (не вычищен
из этого файла последними сессиями — см. §3 «Состояние модулей» как
источник правды по факту реализации).

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
14. ~~**Reschedule slot selection**~~ ✅ сделано в Сессии 43 (PATIENT_RESCHEDULE_OPTIONS.md) —
    staff предлагает 2–3 варианта, пациент выбирает по отдельной ссылке, приём переносится
    автоматически.
15. **Reschedule availability engine v2**: Session 43 не проверяет занятость врача на
    предложенные сотрудником варианты (no overlap re-check) — staff сам отвечает за
    корректность. Естественное продолжение.
16. **Reschedule slot selection — другой врач**: Session 43 жёстко привязывает все варианты к
    врачу текущего приёма; выбор другого врача при reschedule — future.
17. **Recall scheduledAppointmentId v2**: Session 44 оставила `mark scheduled` простым
    переключением статуса без выбора/привязки реального приёма — `scheduledAppointmentId`
    зарезервирован в схеме, но не заполняется. Связать с `/appointments/new` — future.
18. **Recall recurring rules / protocol engine**: Session 44 — каждый recall создаётся вручную
    сотрудником, preset просто считает дату. Привязка набора правил к услуге/протоколу
    («implant → 7d/30d/6m автоматически при done») — естественное продолжение.
19. Реальная отправка recall-напоминаний (WhatsApp Business API / cron) — Session 44
    подготовила честную очередь/preparedAt, но триггер отправки остаётся ручным.
20. ~~**Fix reschedule_offer bell visibility**~~ ✅ сделано в Сессии 46 (NOTIFICATIONS.md,
    раздел «Дополнение (Session 46)») — заодно полный аудит всей `TYPE_PERMISSION`.
21. **Feedback rating analytics v2**: Session 45 — только сырой список (карточка пациента +
    `/feedback`), без среднего рейтинга/тренда/dashboard-виджета. NPS/аналитика — future.
22. **Feedback scheduledAppointmentId-style linking**: Session 45 не даёт выбрать другого
    врача/услугу при создании ссылки — всегда тот же врач/услуга, что у исходного приёма/
    процедуры (как и reschedule в Session 43).
23. **Debt Reminder v2**: Session 47 — очередь `/finance/debts` и подготовка сообщения
    полностью ручные (сотрудник сам решает, когда зайти и нажать кнопку). Online payment
    links, scheduled/cron debt reminders, реальная отправка через WhatsApp Business API —
    future (см. [DEBT_REMINDERS.md](DEBT_REMINDERS.md)).
24. ~~**InventoryItemCard mobile overflow follow-up**~~ ✅ сделано в Сессии 51 (тот же
    `shrink-0`-фикс, что у `DebtReminderRow` в Сессии 50) — заодно найден и исправлен
    отдельный баг (`/inventory` PageHeader actions без `flex-wrap`). См.
    [UX_MOBILE_POLISH.md](UX_MOBILE_POLISH.md).
25. **Tap-target размеры** (`size-8` = 32px, ниже рекомендованных 44px) — широко
    используемая (50+ мест) design-system константа; увеличение — отдельная сессия с
    риском задеть layout повсюду, не делалось ни в Сессии 50, ни в Сессии 51.

Завершено в Сессии 51 (Session 52 НЕ начинать в этой сессии).

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
**PATIENT_RESPONSE_LINKS**, **APPOINTMENT_REMINDER_SCHEDULING**,
**PATIENT_RESCHEDULE_OPTIONS**, **RECALL_TASKS**, **PATIENT_FEEDBACK**,
**DEBT_REMINDERS**, **PRODUCTION_HARDENING**, **UX_MOBILE_POLISH**,
**DEMO_PRESENTATION** (сценарий показа клинике, сессия 52),
**RELEASE_CANDIDATE_CHECKLIST** (сводный QA/release-чеклист, сессия 53),
**DEPLOYMENT_RUNBOOK** (шаги конкретного деплоя + smoke tests, сессия 54),
**BACKUP_MONITORING** (backup-расписание, retention, monitoring, сессия 54),
**EXTERNAL_AUDIT** (CodeQL/CI/npm audit, внешние сканеры, сессия 55),
**CI_E2E_STRATEGY** (DB-backed e2e в CI, manual-first, сессия 56),
**INVENTORY_MEDICINE_UNITS_V2_PLAN** (аудит и план units/medicine v2,
сессия 63 — обязательно прочитать перед началом сессий 64-66).
