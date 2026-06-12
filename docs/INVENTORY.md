# Dental Pro CRM — Модуль Anbar (Inventory)
**by AV Systems** · v1.0 · Сессия 10
Связанные документы: [DATABASE.md](DATABASE.md) §G · [TREATMENTS.md](TREATMENTS.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Routes

| Маршрут | Содержимое |
|---|---|
| `/inventory` | summary (Ümumi / Az qalanlar / Bitmiş / Bu ay istifadə) + LowStockPanel + фильтры (поиск, категория, «yalnız az qalanlar») + список |
| `/inventory/new` | создание материала (initialQuantity > 0 → автоматическое движение «Mədaxil: İlkin qalıq») |
| `/inventory/[id]` | карточка: остаток, минимум, цена, поставщик, срок годности; форма движения (Mədaxil/Məxaric/Silinmə); история 20 движений |
| `/treatments/[id]/materials` | материалы процедуры: список использованных + себестоимость + форма списания |

## Models (schema.prisma НЕ менялась)

Маппинг отличий от ТЗ: `purchasePrice`→`unitCost` (qəpik); `supplierName`→FK `supplierId` (**find-or-create Supplier по имени** — основа будущих заказов поставщику); `location`/`note` — полей нет, отложено; типы движений purchase/usage/waste/return → enum `in/out/write_off` (+`in` с reason для возврата); `previousQuantity/newQuantity` в движении не хранятся — остаток (`quantity`, Decimal 12,3 — дробные количества) кэшируется на материале и пересчитывается транзакционно; `TreatmentItemMaterial.unitCost` обязателен — копируется с материала (себестоимость информационная).

## Movement lifecycle

Append-only журнал: `in` (+), `out`/`write_off` (−), `adjustment` — в схеме, **UI v1 не делает** (приход/расход/списание покрывают сценарии; ТЗ допускает). Каждое движение — интерактивная транзакция + `pg_advisory_xact_lock('inv:'+itemId)::text` (урок сессии 9): чтение остатка → проверка → движение → обновление кэша. **Отрицательный склад запрещён.** Повторный материал на процедуре — отдельной строкой (= отдельное движение, v1).

## Low stock

Статус вычисляется: `out` (qty ≤ 0) > `low` (qty ≤ min) > `expiring` (срок ≤ 30 дней) > `normal`. LowStockPanel на /inventory. **Notification `inventory_low_stock` (in_app) создаётся только при переходе normal→low/out** — повторные расходы ниже минимума не спамят. UI уведомлений — будущий модуль (записи копятся в notifications).

## Treatment material usage

Списание = **`treatments.manage`** (медицинское действие врача; у врача нет inventory.manage — иначе он не мог бы фиксировать материалы). Правила: процедура в scope пользователя (чужая → 404/ошибка), `cancelled` — запрещено (done/in_progress/planned — разрешено), материал — своей клиники, остаток достаточен. Создаётся `treatment_item_material` + движение `out` с `treatmentItemId` + audit. Карточка процедуры показывает строку материалов; страница материалов — себестоимость (Σ qty×unitCost, информационно, **Finance не пересчитывается**).

## Permissions / Tenant

`inventory.view/manage` существовали; **врачу добавлен `inventory.view`** в дефолты роли (идемпотентный seed довыдаёт) — врач видит остатки, управляет складом owner/admin. Assistant — без inventory-прав. Чужой материал → 404; server actions перепроверяют клинику/scope; audit_log: создание материала, движение, списание на процедуру.

## Не входит в v1

Заказы поставщику (`supplier_orders` — схема готова, Supplier создаётся по имени), adjustment-форма, partii/FIFO-себестоимость, инвентаризация, barcode, location/note поля, экспорт, UI уведомлений.

## Known risks

Кэш `quantity` консистентен в транзакциях, но прямые правки БД рассинхронизируют (истина — Σ движений); удаление материала — soft delete (движения остаются); notification без `userId` (общеклиничная запись) — адресация появится с UI уведомлений.

## Next step

Полировка MVP: живой дашборд (реальные цифры вместо demo), отмена счёта, Sənədlər/PDF (последний placeholder на пациенте), supplier orders.

## Проверка

`npx tsx scripts/e2e-inventory-check.ts` (нужен dev-сервер + seed).
