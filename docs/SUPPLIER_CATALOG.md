# Supplier Catalog v1 (сессия 28)

Модуль управления внешними прайс-листами поставщиков.
**Не является** управлением складскими остатками — это каталог цен для справки и будущих заказов.

## Маршруты

| Путь | Компонент | Описание |
|---|---|---|
| `/inventory/suppliers` | `SupplierList` | Список поставщиков клиники |
| `/inventory/suppliers/new` | `CreateSupplierForm` | Форма создания поставщика |
| `/inventory/suppliers/[id]` | `SupplierDetailCard` + `CatalogTable` + `ImportExcelForm` | Детали + каталог + импорт |

Доступ через кнопку «Təchizatçılar» на странице `/inventory`.

## Права доступа

| Роль | inventory.view | inventory.manage |
|---|---|---|
| owner / admin | ✓ | ✓ |
| doctor | ✓ | — |
| assistant | — | — |
| accountant / reception | — | — |

- `inventory.view` — просмотр списка поставщиков и каталога.
- `inventory.manage` — создание, редактирование, деактивация поставщика; импорт Excel; деактивация позиций.

## Модель данных

### `Supplier` (расширен в сессии 28)

Добавлено поле `whatsapp String?`.

### `SupplierCatalogItem` (новая модель)

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | PK |
| `clinicId` | UUID | Tenant-ключ |
| `supplierId` | UUID | FK → Supplier |
| `sku` | String? | Артикул поставщика |
| `name` | String | Наименование |
| `category` | String? | Категория из файла |
| `brand` | String? | Производитель |
| `unit` | String? | Единица измерения |
| `price` | Decimal(12,2) | Цена (исключение из правила «Int в гяпиках») |
| `currency` | Char(3) | Валюта, по умолчанию «AZN» |
| `minOrderQty` | Decimal(12,3)? | Минимальная партия |
| `availability` | String? | Наличие (свободный текст из файла) |
| `sourceRow` | Int? | Номер строки в исходном файле |
| `importedAt` | Timestamptz | Время последнего импорта |
| `isActive` | Boolean | Деактивируется вручную или при обновлении |

**SupplierCatalogItem НЕ связана с InventoryItem в v1.**

### Upsert-логика при импорте

- Если у позиции есть `sku`: upsert по `(supplierId, sku)`.
- Если `sku` отсутствует: upsert по `(supplierId, normalizedName)` — имя lowercase + collapse whitespace.

### Tenant-безопасность

`SupplierCatalogItem` добавлена в `TENANT_MODELS` — tenant-клиент автоматически инжектирует `clinicId` во все запросы.

## Excel-импорт

- Библиотека: `xlsx` (SheetJS), парсинг серверный из `Buffer` — файл **не сохраняется** на диск.
- Лимит: 1000 строк (берётся `rows.slice(1, 1001)`).
- Максимальный размер файла: 10 МБ.
- Форматы: `.xlsx`, `.xls`.
- Обязательные столбцы: **name** и **price** (если отсутствуют — ошибка).
- Нормализация заголовков: поддерживаются AZ / RU / EN варианты названий столбцов (см. `HEADER_ALIASES` в `lib/actions/suppliers.ts`).
- Строки без имени или некорректной ценой — пропускаются (счётчик `skipped`).
- Результат: `{ inserted, updated, skipped }` — отображается в UI.

### Пример заголовков Excel

| AZ | RU | EN |
|---|---|---|
| Ad / Adı | Наименование / Название | Name |
| Qiymət | Цена | Price |
| SKU / Kod | Артикул / Код | SKU |
| Kateqoriya | Категория | Category |
| Brend | Бренд / Марка | Brand |
| Vahid | Единица / Ед | Unit |
| Min miqdar | Мин заказ | Min order |
| Mövcudluq | Наличие | Availability |

## Компоненты

| Компонент | Файл |
|---|---|
| `SupplierList` | `components/suppliers/SupplierList.tsx` |
| `CreateSupplierForm` | `components/suppliers/CreateSupplierForm.tsx` |
| `SupplierDetailCard` | `components/suppliers/SupplierDetailCard.tsx` |
| `ImportExcelForm` | `components/suppliers/ImportExcelForm.tsx` |
| `CatalogTable` | `components/suppliers/CatalogTable.tsx` |
| `CatalogFilterBar` | `components/suppliers/CatalogFilterBar.tsx` |
| `DeactivateSupplierButton` | `components/suppliers/DeactivateSupplierButton.tsx` |

## Server Actions

Файл: `lib/actions/suppliers.ts`

| Action | Права | Описание |
|---|---|---|
| `createSupplier` | manage | Создать поставщика; redirect → `/inventory/suppliers/[id]` |
| `updateSupplier` | manage | Обновить данные поставщика; supplierId из скрытого поля |
| `deactivateSupplier` | manage | isActive = false; redirect → `/inventory/suppliers` |
| `deactivateSupplierCatalogItem` | manage | isActive = false для позиции каталога |
| `importSupplierCatalogExcel` | manage | Разобрать Excel из FormData, upsert позиции |

**clinicId всегда берётся из сессии, никогда из формы.**

## Seed

Demo-данные в `prisma/seed.ts` (секция 16):
- Поставщик **«Demo Dental Təchizat»** с контактными данными.
- 4 позиции каталога (Septanest, Filtek Z250, ProTaper Next, əlcək).

## Миграция

`20260617084040_add_supplier_catalog`:
- Добавляет `whatsapp` в `suppliers`.
- Создаёт таблицу `supplier_catalog_items` со всеми индексами.

## Зависимость

`xlsx` (SheetJS) добавлена в `package.json` и `serverExternalPackages` в `next.config.ts`.

## Out of scope (v1)

- Связь с `InventoryItem` (v2 — «добавить в склад из каталога»).
- Заказы у поставщика (`SupplierOrder` / `SupplierOrderItem`) — реализовано в сессии 29 (см. SUPPLIER_ORDERS.md).
- Email / WhatsApp рассылка поставщику.
- Корзина и финансовый расчёт.
- OCR / автопарсинг PDF прайс-листов.
- S3 хранение файлов.

## Известные ограничения

- Деактивация позиций — только по одной (нет bulk-деактивации).
- Нет пагинации каталога (лимит 500 позиций на таблицу в `listCatalogItems`).
- Нет поиска по всем поставщикам сразу.
- `Decimal` в цене — исключение из правила «Int в гяпиках» (price-list цены могут быть дробными и большими).
