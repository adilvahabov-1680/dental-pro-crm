# Dental Pro CRM — Модуль Müalicə (Treatments)
**by AV Systems** · v1.0 · Сессия 8
Связанные документы: [DATABASE.md](DATABASE.md) §D · [DENTAL_CHART.md](DENTAL_CHART.md) · [APPOINTMENTS.md](APPOINTMENTS.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Routes

| Маршрут | Содержимое |
|---|---|
| `/treatments` | последние 50 процедур в scope; фильтры: поиск пациента, статус, врач (для админ-ролей), зуб |
| `/treatments/new` | общая форма (пациент выбирается) |
| `/patients/[id]/treatments` | планы пациента + инлайн-создание плана + все процедуры |
| `/patients/[id]/treatments/new` | форма для пациента; `?tooth=16` (из панели зуба) и `?appointmentId=…` (из карточки приёма) — преселекты |
| `/patients/[id]` | живой блок «Müalicə»: счётчик, активный план, последние 3, суммы (aktiv/tamamlanmış) |

## Models (schema.prisma НЕ менялась)

Существующие `TreatmentPlan`/`TreatmentItem` (сессия 3). Маппинг отличий от ТЗ:
- **title item'а = услуга**: `serviceId` обязателен по схеме — каждая процедура из каталога услуг (архитектурно чище);
- **diagnosis/procedureDone/doctorNote** → единое поле `notes`; диагноз зуба живёт в `tooth_records` (модули не смешиваются);
- **quantity/unitPrice/totalPrice** → одно поле `price` (+`discount`), деньги в гяпиках; quantity не вводился (позубная тарификация; добавление поля = изменение схемы, отложено);
- **createdById** → авторство в `audit_logs`;
- статусы item — существующий enum `ItemStatus` (`planned·in_progress·done·cancelled`), плана — `PlanStatus` (6); AZ-метки в `lib/constants.ts`.

## Связи

- **Пациент**: scope по пациенту (как dental chart) — врач видит лечение своих пациентов, ассистент — пациентов прикреплённого врача.
- **Зуб**: `toothNumber` (FDI, валидация isValidFdi) + автолинк `toothRecordId`, если карта инициализирована; в панели зуба — read-only «Son prosedurlar» (3) и кнопка «Yeni müalicə» с deep-link. **Treatment item ≠ tooth_history** — история статусов зуба не затрагивается.
- **Приём**: `appointmentId` опционален; сервер проверяет принадлежность приёма пациенту (чужой → ошибка); кнопка «Müalicə əlavə et» на карточке приёма.
- **План**: опциональный select; инлайн-создание (title); `totalPrice` плана автоматически = Σ(price−discount) некэнселённых items при каждом create/смене статуса.

## Price logic (v1)

Цена подставляется из текущего `Price` услуги (`validTo = null`), редактируема; услуга без прайса → ручной ввод (fallback). Ввод в AZN («80», «25,50») → хранение в гяпиках. `discount` опционален. `done` без даты → `performedAt = now`. `cancelled` исключается из сумм. Invoice/payment не создаются — Finance построит счёт по выполненным items (`invoiceId` в схеме уже зарезервирован).

## Permissions / Tenant

`treatments.view/manage` существовали в каталоге (doctor — vm, assistant — view, owner/admin — всё; reception/accountant — нет). Server actions не доверяют форме: пациент через `getPatientForUser`, врач для doctor/assistant фиксирован, услуга/план/приём проверяются на клинику и пациента, статус — `getTreatmentItemForUser` + `safeUpdateByTenant`. Audit: create item/plan, смена статуса.

## Не входит в v1

Quantity; редактирование/удаление item (только смена статуса); материалы (`treatment_item_materials` — v1.2 со складом); surfaces зуба; экспорт; обновление статуса зуба из процедуры (намеренно — врач делает это на карте).

## Next step

**Finance module**: invoice из выполненных treatment_items пациента (`invoice_items.treatment_item_id` готов), payments, debts.

## Проверка

`npx tsx scripts/e2e-treatments-check.ts` (нужен dev-сервер + seed).
