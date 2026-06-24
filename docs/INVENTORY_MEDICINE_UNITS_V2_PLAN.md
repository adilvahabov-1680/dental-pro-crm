# Dental Pro CRM — Inventory / Medicine Units v2: Audit & Architecture Plan

**by AV Systems** · создано в сессии 63 (Inventory / Medicine Units Audit & Architecture v1)

Это **аудит и план**, не реализация. Цель — понять, что уже есть, что
реально отсутствует, и спланировать минимально рискованную серию малых
сессий. **Schema.prisma в этой сессии не менялась.**

---

## 1. Аудит текущей системы

### 1.1 Что уже полностью поддерживается (не требует новой работы)

| Требование пользователя | Где уже реализовано |
|---|---|
| Единица закупки → базовая единица склада, с коэффициентом | `InventoryItem.unit` (база) + `.purchaseUnit` (опционально) + `.purchaseToBaseFactor` (Decimal, default 1) — `prisma/schema.prisma:979-1011`, см. `docs/INVENTORY_UNITS.md` (сессия 32) |
| «Доза» как отдельная единица расхода (анестетик, бондинг) | `InventoryItem.doseToBaseFactor` (опционально) + `calculateBaseQuantity()` в `lib/treatment-consumables.ts` — конвертирует `unit: "dose"` в базовые единицы |
| Стандартный расход по умолчанию на услугу, настраиваемый | `ServiceConsumableTemplate` (сессия 33) — `quantity`/`unit`/`allowOverride`/`isRequired` на пару (service, inventoryItem) |
| Автозаполнение расхода после процедуры + ручная коррекция **до** подтверждения | `/treatments/[id]/consumables` → `TreatmentConsumableChecklist` показывает prefilled количества из шаблона; редактируемо если `allowOverride=true`; пропускаемо если `isRequired=false`; финальное применение — `applyTreatmentConsumablesAction()` (`lib/actions/treatment-consumables.ts`) |
| Защита от отрицательного остатка | Atomic `pg_advisory_xact_lock` + проверка `next < 0` внутри транзакции (`lib/actions/treatment-consumables.ts:201-212`) |
| Audit/reversal списания | `TreatmentConsumableUsage.isReversed/reversedAt/reversedById/reversalReason` (сессия 36) — полный reversal с восстановлением остатка |
| Tenant isolation | Все функции через `tenantClient(clinicId)`; `clinicId` только из сессии — подтверждено во всех проверенных файлах |
| Permissions | `treatments.manage` (apply/reversal), `settings.manage` (CRUD шаблонов), `inventory.manage` (остатки/корректировки) — разделены корректно |
| Себестоимость расходников | `/reports/consumables` — по материалу/услуге/врачу за период (`lib/consumable-cost-reports.ts`) |
| Поставщики/заказы/приход/low-stock | `Supplier`/`SupplierOrder`/`SupplierOrderItem`/`SupplierCatalogItem`, draft-approval flow, low-stock alerts + reorder drafts — всё реализовано (сессии 28-40) |

**Покрытие e2e по этой области: 209+ проверок** (13 файлов скриптов,
суммарно — `e2e-inventory-check`, `e2e-inventory-units-check`,
`e2e-inventory-corrections-check`, `e2e-service-consumable-templates-check`,
`e2e-treatment-consumable-usage-check`,
`e2e-treatment-consumable-reversal-check`,
`e2e-consumable-cost-reports-check`, `e2e-low-stock-alerts-check`,
`e2e-low-stock-reorder-drafts-check`, `e2e-supplier-catalog-check`,
`e2e-supplier-orders-check`, `e2e-supplier-order-draft-approval-check`,
`e2e-supplier-receiving-check`, плюс `e2e-consumables-audit-visibility-check`).

**Вывод**: техническая инфраструктура конверсии единиц/шаблонов/списания/
audit **уже существует и работает** — это НЕ нужно строить с нуля.

### 1.2 Что реально отсутствует

1. **«Doctor daily report»** (требование §7 пользователя) — отчёта
   «пациенты + процедуры + доход/прибыль + списанные материалы + расход
   по пациенту, за день, по врачу» **не существует**. Есть только
   `/reports/consumables` — это отчёт по себестоимости расходников за
   произвольный период (не «за день»), без revenue/profit, без
   patient count. Это главный реальный геп.
2. **Структурированный «тип» материала** (medicine/consumable/disposable/
   material/anesthesia) отдельно от свободной категории —
   `InventoryCategory.name` сейчас просто строка («Anesteziya»,
   «Plomba materialları» и т.д.). Категории УЖЕ дают эту гибкость без
   изменения схемы, но нет structured enum для фильтрации/отчётности
   по «типу» независимо от названия категории конкретной клиники.
3. **Optional dosage/strength metadata** («Lidocaine 2% + epinephrine
   1:100000», «37% phosphoric acid») — чисто информационного поля для
   этого на `InventoryItem` сейчас нет. `doseToBaseFactor` — это
   конверсионный коэффициент, не описательная метаинформация.
4. **Авто-напоминание после завершения процедуры** — сейчас переход на
   `/treatments/[id]/consumables` ручной (нужно знать, что туда идти);
   нет banner/redirect при смене статуса процедуры на `done`/`completed`.

### 1.3 Где текущая модель опасна/confusing — **реальная находка сессии**

Проверены фактические demo-данные (`prisma/seed.ts:611-657`):

```text
{ name: "Lateks əlcək M", unit: "qutu", qty: 1, min: 5 }   // перчатки — БАЗА = коробка!
{ name: "Steril maska",   unit: "qutu", qty: 6, min: 3 }   // маски — БАЗА = коробка!
{ name: "Kompozit A2",    unit: "şpris", ... }              // композит — БАЗА = целый шприц
```

**Это не баг схемы или кода** — `purchaseUnit`/`purchaseToBaseFactor`
работают правильно везде, где их используют корректно. Это **баг
конкретной конфигурации данных**: для перчаток/масок базовая единица
склада (`unit`) указана как закупочная упаковка («коробка»), а не как
реальная единица расхода («штука»/«пара»). Из-за этого:

- списать «4 перчатки на процедуру» технически невозможно — система
  считает остаток в коробках, а не в штуках;
- реальная клиника, заводя материал так же интуитивно («у меня же
  перчатки в коробках») наступит на ту же проблему — **в форме создания
  материала нет подсказки/валидации**, что обычно одноразовые
  расходники считают в штуках с покупкой по коробкам, а не наоборот.

Это именно сценарий, который явно описал пользователь («gloves: purchase
box of 50/100, usage pcs») — механизм для этого уже есть, но ни один
живой пример в demo не показывает его правильно настроенным.

## 2. Предлагаемая модель данных

### 2.1 Минимальный вариант — без миграции схемы

- Пересоздать demo `InventoryItem` для перчаток/масок/игл/слюноотсосов/
  нагрудников с правильной базовой единицей (`ədəd`/`cüt`) и `purchaseUnit`
  = «qutu» + реалистичный `purchaseToBaseFactor` (см. §6 risk note про
  точные числа — это inventory-метаданные, не клиническая рекомендация):
  - перчатки: база `cüt` (пара), purchase `qutu`, factor ≈ 50 (пар/коробка)
  - маски: база `ədəd`, purchase `qutu`, factor ≈ 50
  - иглы: база `ədəd`, purchase `qutu`, factor ≈ 100
  - слюноотсосы: база `ədəd`, purchase `qutu`, factor ≈ 100
  - анестетик: база `ml`, purchase `karpul`, factor ≈ 1.8 (или оставить
    `karpul` как базу, если клиника считает картриджами целиком — оба
    варианта валидны, выбор зависит от того, дробят ли картридж)
- Добавить 1-2 `ServiceConsumableTemplate` примера в seed, показывающих
  реальный default-usage workflow (например, «Kanal müalicəsi» →
  анестетик 1 доза + перчатки 1 пара + маска 1 шт).
- **Doctor daily report** — реализуем как READ-ONLY агрегирующие запросы
  (по аналогии с `lib/consumable-cost-reports.ts`) над уже существующими
  таблицами (`TreatmentItem`, `TreatmentConsumableUsage`, `Invoice`,
  `Payment`, `Appointment`), с фильтром `performedAt`/`paidAt` за день +
  `doctorId`. **Не требует новых таблиц.**

### 2.2 Опциональный вариант — малая additive-миграция (если решено нужным)

Только если после Session 64-65 станет ясно, что структурный «тип» и
описательные dosage-метаданные действительно нужны для UX/отчётности:

```prisma
enum InventoryItemType {
  medicine
  consumable
  disposable
  material
  equipment
}

model InventoryItem {
  // ... существующие поля без изменений
  itemType     InventoryItemType?  @map("item_type")       // nullable — backward-compatible
  strengthNote String?             @map("strength_note")   // "2% + epi 1:100000" — чисто метаданное, не для расчётов
}
```

- Оба поля **nullable** — существующие записи получают `NULL`, никакого
  backfill не требуется, никакой existing query не ломается.
- `strengthNote` — свободный текст, явно описан как «inventory metadata
  только», не используется в формулах конверсии и не подключается к
  клиническим расчётам дозировки (по требованию — «do not over-medicalize»).
- Это единственное место, где потенциально нужна миграция — и она
  целиком additive/optional, низкого риска.

## 3. Предлагаемый UX (для будущих сессий, не сейчас)

- **Item create/edit** (`/inventory/new`, `/inventory/[id]`): добавить
  (если реализуется §2.2) опциональный dropdown «Tip» и текстовое поле
  «Güc/dozaj qeydi» — оба необязательны, не блокируют сохранение. Плюс
  **soft-подсказка** (не hard-валидация): если `unit` похож на
  упаковочное слово (qutu/box/pack/karton), показать «Adətən əsas vahid
  ədəd/cüt olur, alış vahidi isə qutu — yoxlayın».
- **Service default usage templates** (`/settings/services/[id]`): уже
  работает, без изменений UX в этой сессии.
- **Treatment actual usage confirmation** (`/treatments/[id]/consumables`):
  уже работает (prefill + override); предложение — banner/badge на
  карточке процедуры при смене статуса на `done`, напоминающий
  «Materiallar tətbiq olunmayıb» со ссылкой на эту страницу (не
  автоматический redirect — чтобы не нарушать текущий flow).
- **Assistant correction flow**: уже реализован через `allowOverride` —
  никаких изменений не требуется.
- **Doctor daily report** (новая страница, например
  `/reports/doctor-daily` или таб внутри `/reports/consumables`):
  фильтр «дата» (по умолчанию — сегодня) + «врач»; карточки-метрики
  (пациенты, процедуры, доход, списано материалов) + раскрываемый
  per-patient breakdown.

## 4. Совместимость

- **Demo data**: изменение unit-конфигурации существующих seed-материалов
  затронет только demo/локальную БД — реальных production-клиник пока нет
  (подтверждено в `docs/RELEASE_CANDIDATE_CHECKLIST.md`). Идемпотентный
  `db:seed` ищет материалы по имени — при смене `unit` существующей записи
  по тому же имени seed её **не обновит** (см. `upsertUser`-подобный
  паттерн — материалы создаются только `if (!item)`); потребуется либо
  явный update-блок в seed, либо переименование демо-материалов.
- **Existing reports**: `/reports/consumables` не меняется структурно —
  новый daily report — отдельная страница/функция.
- **Existing e2e (209+)**: при строго additive-изменениях (новые nullable
  поля, новые функции/страницы, исправление только demo-данных) — не
  затрагиваются. Риск: e2e-скрипты, которые ищут конкретные demo-материалы
  по имени/unit (например `e2e-inventory-units-check.ts`,
  `e2e-low-stock-alerts-check.ts` могут проверять текущие qty/min для
  перчаток/масок) — **нужно построчно проверить перед изменением demo
  unit-конфигурации**, чтобы не сломать существующие assertions.
- **Migration safety**: §2.2 — если реализуется, миграция чисто additive
  (`ALTER TABLE ... ADD COLUMN ... NULL`), безопасна для применения на
  любой существующей БД, включая demo Neon.

## 5. Разбивка на сессии

| Сессия | Объём | Миграция схемы | Риск |
|---|---|---|---|
| **Session 64** — Demo data: реалистичные единицы измерения | Пересоздать/обновить demo `InventoryItem` (перчатки/маски/иглы/слюноотсосы) с корректными base/purchase units и factor; добавить 1-2 `ServiceConsumableTemplate` примера в seed; **построчно проверить существующие e2e** (`e2e-inventory-units-check`, `e2e-low-stock-alerts-check` и смежные) на зависимость от текущих unit-значений перед правкой | Нет | Низкий |
| **Session 65** — Doctor Daily Report v1 | Новая read-only страница/отчёт (агрегаты по `TreatmentItem`/`TreatmentConsumableUsage`/`Invoice`/`Payment`, фильтр день+врач); новые permissions-проверки; новый e2e-набор | Нет | Средний |
| **Session 66** (опционально, только если подтверждена реальная потребность после 64-65) — `InventoryItem.itemType`/`strengthNote` | Малая additive-миграция (§2.2); обновление формы создания/редактирования материала; soft UX-подсказка про единицы | Да, additive/nullable | Средний (затрагивает schema.prisma, требует regression существующих inventory e2e) |

**Явное правило для всех будущих сессий этой темы**: переиспользовать
существующие модели (`ServiceConsumableTemplate`, `TreatmentConsumableUsage`,
`purchaseUnit`/`purchaseToBaseFactor`/`doseToBaseFactor`) — **не создавать
параллельную систему**. Риск дублирования архитектуры — главная опасность
при делегировании этой темы будущим сессиям без контекста этого документа.

## 6. Риски

| Риск | Митигация |
|---|---|
| Ошибки конверсии единиц при заведении нового материала | Уже митигировано структурно (`purchaseToBaseFactor`/`doseToBaseFactor`); человеческий фактор — добавить soft-подсказку в форме (§3), не hard-валидацию (единицы измерения слишком разнообразны для жёсткого списка) |
| Дробный расход (доли картриджа/мл) | Уже поддержано — `Decimal(12,3)` на всех quantity-полях, `doseToBaseFactor` существует именно для этого |
| Отрицательный остаток | Уже защищено — atomic advisory lock + проверка в транзакции |
| Permissions на новый daily report | Использовать существующий паттерн (`requirePermission`), вероятно комбинация `treatments.view`+`finance.view`, либо отдельный `reports.view` — решить в Session 65, не сейчас |
| Tenant isolation в новом коде | Строго через `tenantClient(clinicId)`, как везде — паттерн уже установлен, нарушение было бы регрессией стиля, не новым риском |
| Audit trail для будущих функций | Следовать паттерну `TreatmentConsumableUsage` (reversal-поля) — не изобретать новый |
| **Специфичный риск этой темы**: дублирование уже существующей функциональности | См. явное правило в конце §5 — каждая будущая сессия должна сначала прочитать этот документ |
| Реалистичность конкретных чисел purchaseToBaseFactor (50 пар/коробка перчаток, 1.8 мл/картридж и т.п.) | Это inventory-метаданные для демонстрации, не клинические рекомендации — источники: [Xchart](https://www.xcharthelp.com/en/articles/10715003-notes-on-dental-local-anesthesia-cartridge-carpule-volume), [Decisions in Dentistry](https://decisionsindentistry.com/article/update-on-maximum-local-anesthesia-dosages/), [WholeDent](https://www.wholedent.com/collections/disposables) — конкретные числа должны быть настраиваемы клиникой при реальном использовании, demo-значения — лишь правдоподобный пример |

## 7. Рекомендация

**Не реализовывать сейчас** (по explicit scope этой сессии). Архитектурно
систему **не нужно перестраивать** — основа уже правильная и
протестирована (209+ e2e). Реальный объём работы намного меньше, чем
могло показаться из исходного запроса: это в основном **demo data fix +
один новый отчёт**, а не новая модель данных.

**Первая безопасная coding-сессия — Session 64 (Demo data fix)**:
- не требует миграции схемы вообще;
- использует уже существующие, протестированные поля правильно;
- даёт немедленную видимую ценность для demo (реалистичная конверсия
  единиц, видимая любому, кто смотрит презентацию);
- создаёт реалистичную основу данных для Session 65 (Doctor Daily Report).

`InventoryItem.itemType`/`strengthNote` (Session 66) — оставить как
**опциональный** шаг, реализовать только если после 64-65 станет ясно,
что свободных категорий действительно недостаточно для отчётности/UX.

## См. также

- [INVENTORY_UNITS.md](INVENTORY_UNITS.md) — текущая механика конверсии единиц (сессия 32).
- [SERVICE_CONSUMABLE_TEMPLATES.md](SERVICE_CONSUMABLE_TEMPLATES.md) — шаблоны стандартного расхода (сессия 33).
- [TREATMENT_CONSUMABLE_USAGE.md](TREATMENT_CONSUMABLE_USAGE.md) / [TREATMENT_CONSUMABLE_REVERSAL.md](TREATMENT_CONSUMABLE_REVERSAL.md) — фактическое списание и reversal (сессии 34, 36).
- [CONSUMABLE_COST_REPORTS.md](CONSUMABLE_COST_REPORTS.md) — текущий отчёт по себестоимости (сессия 35).
- [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) — подтверждение, что production-клиник пока нет (низкий риск для demo data fix).
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — история сессий, конвенции.
