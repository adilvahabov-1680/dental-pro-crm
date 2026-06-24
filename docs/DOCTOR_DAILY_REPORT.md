# Dental Pro CRM — Doctor Daily Report v1
**by AV Systems** · Сессия 70
Связанные документы: [INVENTORY_MEDICINE_UNITS_V2_PLAN.md](INVENTORY_MEDICINE_UNITS_V2_PLAN.md) §1.2/§5 · [CONSUMABLE_COST_REPORTS.md](CONSUMABLE_COST_REPORTS.md) · [TREATMENT_CONSUMABLE_USAGE.md](TREATMENT_CONSUMABLE_USAGE.md)

## Route

`/reports/daily-doctor` — read-only, без мутаций. Доступ: `requirePermission("treatments.view")`.

## Scope (без новых permissions, без миграции)

Видимость по врачу — как на `/treatments` (`user.role !== "doctor" && user.role !== "assistant"` решает, показывать ли фильтр):

- **doctor** — только свои данные; `doctorId` форсируется из сессии, query-параметр `?doctor=` игнорируется.
- **assistant** — только прикреплённый врач (`assignedDoctorId`); если не назначен — пустой экран с пояснением, запросы к БД не выполняются.
- **owner/admin** — вся клиника по умолчанию + дропдаун выбора врача.
- **reception/accountant** — блокируются `requirePermission` (нет `treatments.view` в дефолтных правах роли).

Секции внутри страницы дополнительно гейтятся отдельными правами:
- `finance.view` — выручка, статус счёта, платежи за день.
- `inventory.view` — себестоимость и список расходников.

У ассистента по дефолту нет ни `finance.view`, ни `inventory.view` — отчёт показывает только пациентов/процедуры, без денег и расходников (если их права не расширены через `user_permissions`).

## Что считается «сделано сегодня»

`TreatmentItem.status = "done"` AND `performedAt` в выбранный день (по умолчанию — серверная локальная дата, известный TODO tz из других модулей этим не решается).

## Финансовые цифры — что показываем и почему

| Метрика | Источник | Почему так |
|---|---|---|
| Müalicə dəyəri (revenue) | Σ `(price - discount)` самих `TreatmentItem` за день/врача | Однозначно привязано к врачу и дате — собственные поля процедуры. |
| Sərfiyyat xərci | реюз `lib/consumable-cost-reports.ts` (`getConsumableCostSummary`/`getConsumableCostByInventoryItem`) с фильтром `dateFrom/dateTo/doctorId` | Тот же источник истины, что и `/reports/consumables`; `baseQuantity` — это факт применения (`wasSkipped=false`, `isReversed=false`), учитывает ручной override и reversal, а не шаблонное значение по умолчанию. |
| Təxmini mənfəət (profit) | revenue − sərfiyyat xərci | Обе части корректно scoped по врачу/дате — чистая оценка, не равна кэш-прибыли клиники (не учитывает прочие расходы). |
| Bu gün ödənişlər (payments) | `Σ Payment.amount` за день, **только когда фильтр по врачу не применён** | `Payment` не имеет `doctorId`/`treatmentItemId` в схеме — корректно атрибутировать платёж конкретному врачу невозможно без изменения finance-логики (что вне scope сессии). Показываем только клиника-wide цифру; при выборе конкретного врача карточка скрывается, а не показывает неверное число. |
| Hesab statusu (по процедуре) | `TreatmentItem.invoice.status/total/paidAmount`, если `invoiceId` задан | Факт, без перерасчёта/пропорционального деления платежа между процедурами одного счёта. |

**Finance/inventory write-off логика не менялась** — все вычисления read-only поверх существующих моделей.

## Materials/Medicines

Агрегат по позиции (`item, qty, unit, totalCost`) — прямой реюз `getConsumableCostByInventoryItem`. Ссылка «Ətraflı (pasiyent üzrə)» ведёт на `/reports/consumables?from=...&to=...&doctor=...` (уже существующий детальный отчёт с разбивкой по пациенту/услуге/материалу) — не дублирует UI.

## Tenant isolation

`clinicId` — только из сессии (`user.clinicId`), как везде; все запросы через `tenantClient`. Доктор/ассистент не может получить данные другого врача подменой `?doctor=` — параметр читается из query только для ролей owner/admin, для doctor/assistant полностью игнорируется на сервере.

## Точка входа

Кнопка «Gündəlik həkim hesabatı» в шапке `/treatments` (видна всем, у кого открыта сама страница `/treatments`, т.е. есть `treatments.view`) — без изменений `components/layout/nav.ts` (без нового top-level пункта меню, чтобы не «перегружать» навигацию).

## Проверка

`npx tsx scripts/e2e-doctor-daily-report-check.ts` (нужен dev-сервер + seed).
