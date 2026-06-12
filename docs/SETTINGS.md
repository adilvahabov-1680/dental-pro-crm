# Dental Pro CRM — Модуль Ayarlar / Settings
**by AV Systems** · v1.0 · Сессия 13
Связанные документы: [DATABASE.md](DATABASE.md) §H2 · [DOCUMENTS.md](DOCUMENTS.md) · [PATIENTS.md](PATIENTS.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Состав v1

| Секция | Где | Хранение |
|---|---|---|
| Реквизиты клиники (ad, telefon, e-poçt, ünvan) | `/settings` | колонки `clinics` |
| Параметры приёма (standart müddət, xatırlatma saatı) | `/settings` | `settings` scope=clinic, key `default_appointment_minutes` / `reminder_hours_before` |
| Видимость пациентов (`doctor_sees_all_patients`) | `/settings` | `settings` scope=clinic |
| Часы работы (həftəlik qrafik) | `/settings` | `settings` key `working_hours` (Json) |
| Прайс услуг (создание, цена, деактивация) | `/settings/services` | `services` + `prices` (append-only) |

Реквизиты сразу попадают в шапку PDF (`clinicInfo` в lib/actions/documents.ts
читает name/phone/address) — проверено в e2e через pdf-parse.

## Хранение настроек

- Таблица `settings`: key-value Json, scope=clinic (doctorId/userId = null).
  Upsert вручную (`findFirst` → update/create) — unique-индекс с null-колонками
  не работает с prisma upsert. Если значение не изменилось — запись и audit
  не создаются (без шума).
- `working_hours`: `{ mon..sun: { from: "09:00", to: "18:00" } | null }`,
  null = день закрыт. Валидация: HH:MM, from < to (по каждому дню отдельно).
- `default_appointment_minutes` / `reminder_hours_before` пока **не читаются**
  другими модулями (зарезервированы: форма приёма, scheduler напоминаний).
  `doctor_sees_all_patients` читается `patientScopeWhere` (lib/patients.ts).

## Прайс (append-only)

Смена цены: текущая запись `prices` закрывается (`validTo = now`), создаётся
новая с `validFrom = now`, `validTo = null`. Записи Price не редактируются
и не удаляются — старые счета/PDF/отчёты не меняются. Повторная отправка той же
цены новой записи не создаёт. `childPrice` опционален (детская цена).

Деактивация услуги (`isActive=false`) скрывает её из формы лечения
(`listServicesWithPrice` фильтрует isActive), в прайсе остаётся с бейджем
Deaktiv и может быть включена обратно. Дубликат имени услуги отклоняется.

## Permissions / Tenant

- `settings.view` — открыть страницы (owner/admin/doctor); doctor видит формы
  в read-only (`<fieldset disabled>` + предупреждение), server actions всё равно
  требуют manage;
- `settings.manage` — все изменения (только owner/admin по умолчанию);
- assistant/reception без `settings.view` → redirect /dashboard;
- принадлежность service/category клинике перепроверяется через tenantClient;
  чужой serviceId в форме цены → serviceNotFound без утечки;
- Clinic обновляется только по `user.clinicId` из сессии (id из форм не берётся);
- audit_log: `update clinic`, `create/update setting`, `create service`,
  `create price`, `update service` (toggle) — entityType-метки добавлены
  в ленту Son əməliyyatlar (i18n dashboard.activity.entities).

## Файлы модуля

`lib/settings.ts` (запросы) · `lib/validation/settings.ts` (zod + working hours
parser) · `lib/actions/settings.ts` (6 server actions) ·
`components/settings/*` (ClinicProfileForm, ClinicParamsForm, WorkingHoursForm,
ServiceCreateForm, ServicesTable c inline-формами цены/toggle) ·
`app/(dashboard)/settings/page.tsx` + `settings/services/page.tsx`.

## E2E

`npx tsx scripts/e2e-settings-check.ts` — 42 проверки: реквизиты + валидация,
попадание реквизитов в PDF-шапку (pdf-parse), параметры приёма, переключатель
doctor_sees_all_patients с проверкой реального scope врача, часы работы
(+ обратный диапазон), создание услуги, append-only смена цены, дубликаты,
деактивация/скрытие из формы лечения, права doctor/assistant, tenant-изоляция
прайса. Скрипт сохраняет и восстанавливает исходные реквизиты/настройки.

## Не входит в v1

Загрузка логотипа (logoUrl в схеме есть; нужна image-инфраструктура + рендер
в PDF), история цен в UI (хранится в БД, не показывается), CRUD категорий услуг,
переименование/удаление услуг (только create + toggle), per-doctor working hours
(Doctor.workingHours Json в схеме), user-scope настройки, использование
`default_appointment_minutes`/`reminder_hours_before` потребителями.

## Next step

Загрузка файлов в `documents` (снимки/согласия) **или** отправка PDF/напоминаний
(WhatsApp/SMS) — по приоритету заказчика. Также: применить
`default_appointment_minutes` в форме приёма (мелкая задача).
