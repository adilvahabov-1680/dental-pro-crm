# Dental Pro CRM — Session Handoff
**by AV Systems** · обновлено: 2026-06-12 (после сессии 13: Settings v1)

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
| Ayarlar (Settings v1) | готов | `e2e-settings-check` 42/42 |
| Admin (платформа) | **placeholder** | — |

Запуск e2e: `npx tsx scripts/e2e-<module>-check.ts` (нужен dev server + seed).
MVP-цикл закрыт: Pasiyent → Qəbul → Diş xəritəsi → Müalicə → Hesab/Ödəniş →
Anbar/materiallar → Dashboard/Bildirişlər → PDF sənədlər → Ayarlar.

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
  если на странице НЕСКОЛЬКО форм — постить фрагмент конкретной формы
  (`formFragment(html, marker)`), иначе $ACTION-поля смешаются.

## 5. PDF / storage (сессия 12)

- pdfkit + DejaVu Sans (`dejavu-fonts-ttf`) — стандартные шрифты не знают ə/ş/ğ;
  `serverExternalPackages: ["pdfkit"]` в next.config.ts обязателен.
- Деньги в PDF — «AZN» (не ₼). Текст PDF в e2e проверяется через `pdf-parse` v2.
- Файлы: `uploads/documents/{clinicId}/{patientId}/…` (в .gitignore); в БД —
  relative path; `resolveUploadPath` режет traversal/absolute.
- **Production-долг**: serverless-деплой потеряет uploads/ — lib/storage.ts
  спроектирован как единственная точка замены на S3.

## 6. Известные риски / долги

- Проект ещё **не git-репозиторий** — стоит сделать `git init` (uploads/,
  .pglocal/, .env уже в .gitignore).
- Tenant-level notifications: «прочитано» отмечается на записи (один прочитал —
  прочитано для всех); per-user read-state — таблица `notification_reads` в будущем.
- Low-stock notification не хранит id материала → ссылка на `/inventory?low=1`.
- Счёт с оплатами исправляется только через БД (до модуля возвратов).
- Номер PDF `SND-…` — косметический, без lock (дубликаты при гонке не ломают БД).
- В dev-БД остаются артефакты e2e-прогонов (E2E Test Material, тестовые
  пациенты) — для демо врачу пересоздать БД чистым seed.
- Settings `default_appointment_minutes` / `reminder_hours_before` и
  `working_hours` редактируются в UI, но пока не читаются потребителями
  (форма приёма, scheduler) — подключить при доработке соответствующих модулей.
- Upsert настроек — findFirst→update/create без транзакции (гонка двух админов
  теоретически даст дубликат ключа; unique-индекс с null-колонками её не ловит).

## 7. Оставшиеся placeholder'ы

`/admin`, глобальный поиск в topbar (disabled), кнопка
«Pasiyent məlumat forması» (Tezliklə), загрузка файлов в таблицу `documents`
(снимки/согласия), email/WhatsApp/SMS-отправка, загрузка логотипа клиники
(logoUrl в схеме, рендер в PDF не делался).

## 8. Следующая сессия (рекомендация)

Settings закрыт — крупных placeholder'ов MVP не осталось (кроме `/admin`).
Варианты по приоритету заказчика:
1. **Загрузка файлов в `documents`** (снимки/согласия) — блок на карточке
   пациента уже показывает записи; нужна upload-инфраструктура (lib/storage.ts
   готов как точка записи).
2. **Отправка PDF/напоминаний пациенту** (WhatsApp/SMS) — каналы в схеме есть.
3. Мелочь: применить `default_appointment_minutes` в форме приёма;
   `git init` (до сих пор не репозиторий).

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
FINANCE, INVENTORY, DASHBOARD, NOTIFICATIONS, DOCUMENTS, SETTINGS.
