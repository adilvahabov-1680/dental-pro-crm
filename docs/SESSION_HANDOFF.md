# Dental Pro CRM — Session Handoff
**by AV Systems** · обновлено: 2026-06-14 (после сессии 18: MVP Hardening & Demo Readiness)

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
`admin@demo.dentalpro.az` (owner) · `hekim@demo.dentalpro.az` (doctor) ·
`assistent@demo.dentalpro.az` (assistant) · `superadmin@dentalpro.az`.

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
| Fayl yükləmə (Uploads v1 + soft-delete) | готов | `e2e-file-uploads-check` 39/39 |
| Ayarlar (Settings v1) | готов | `e2e-settings-check` 43/43 |
| Əlaqə / Patient Communication (v1, manual click-to-chat) | готов | `e2e-communications-check` 40/40 |
| Global Search (topbar, v1) | готов | `e2e-global-search-check` 22/22 |
| Admin (кадры/роли клиники, v1) | готов | `e2e-admin-check` 36/36 |

Запуск e2e: `npx tsx scripts/e2e-<module>-check.ts` (нужен dev server + seed).
MVP-цикл закрыт: Pasiyent → Qəbul → Diş xəritəsi → Müalicə → Hesab/Ödəniş →
Anbar/materiallar → Dashboard/Bildirişlər → PDF sənədlər → Ayarlar →
Əlaqə/Communication.

Demo smoke-check (сессия 18, не дублирует модульные наборы):
`e2e-demo-flow-check` 10/10 — login owner/doctor/assistant, dashboard,
global search, карточка пациента, hesab, Ayarlar, Admin, role-restrictions.
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
  (не 404) — проверять по содержимому страницы (наличие "404"/"tapılmadı" +
  отсутствие данных целевой сущности), не по статус-коду.

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
  на диске** (future: cleanup-job); удалённые скрыты везде и не скачиваются
  (404); pdf_records не удаляются. Restore — только через БД.
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
- **Admin v1 (сессия 17)**: деактивация (`isActive=false`) проверяется только
  при следующем логине — уже выданная JWT-сессия (до 12 ч) не инвалидируется
  немедленно; временный пароль нового сотрудника показывается один раз и не
  сохраняется (нет email-инвайтов/password-reset). Подробности — ADMIN.md.

## 7. Оставшиеся placeholder'ы

Кнопка «Pasiyent məlumat forması» (Tezliklə), **реальная** отправка
WhatsApp/SMS/email (v1 — только manual click-to-chat через wa.me, см.
COMMUNICATIONS.md), загрузка логотипа клиники (logoUrl в схеме, рендер в
PDF не делался), удаление/привязка к зубу для загруженных файлов
(toothRecordId в схеме есть).

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

## 8. Следующая сессия (рекомендация)

Demo-readiness закрыт. Варианты по приоритету заказчика:
1. Реальная отправка WhatsApp (Business API / провайдер) на основе
   подготовленных в v1 сообщений — требует отдельного решения по
   провайдеру/биллингу.
2. Доработка documents: привязка к зубу/процедуре, preview изображений,
   cleanup-job для deleted/orphan файлов.
3. Admin v2: per-permission overrides (UserPermission UI), custom
   clinic-specific roles, email-инвайты/password-reset.
4. Git remote не настроен — `git remote add origin <URL>` + `git push -u origin main`.

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
COMMUNICATIONS, GLOBAL_SEARCH, ADMIN.
