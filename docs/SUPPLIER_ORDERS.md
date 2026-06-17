# Supplier Orders v1 (сессия 29)

Модуль управления заказами у поставщиков.
Создаётся черновик → отмечается как отправленный → получен/отменён.
Финансовые транзакции, автоотправка и движения склада — вне scope v1.

## Маршруты

| Путь | Компонент | Описание |
|---|---|---|
| `/inventory/supplier-orders` | `SupplierOrdersList` | Список заказов клиники |
| `/inventory/supplier-orders/[id]` | `OrderDetailCard` + `OrderItemsTable` + `OrderStatusActions` | Детали заказа |

Доступ через кнопку «Sifarişlər» на странице `/inventory`.
Кнопка «Yeni sifariş yarat» присутствует на странице `/inventory/suppliers/[id]`.

## Права доступа

| Роль | inventory.view | inventory.manage |
|---|---|---|
| owner / admin | ✓ | ✓ |
| doctor | ✓ | — |
| assistant | — | — |
| accountant / reception | — | — |

- `inventory.view` — просмотр списка заказов, детали, текста сообщения.
- `inventory.manage` — создание черновика, добавление/удаление/изменение позиций, смена статуса.

## Статусы и переходы

```
draft ────── sent ───── received  (terminal)
  │             │
  └── cancelled ◄─── sent → cancelled
       (terminal)
```

- `draft` → `sent`: только при наличии хотя бы одной позиции в заказе.
- `draft` → `cancelled`: в любое время.
- `sent` → `received`: отмечается как полученный (без автоматического движения склада).
- `sent` → `cancelled`.
- `received` / `cancelled`: терминальные — изменений нет.

## Модель данных

### `SupplierOrder`

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | PK |
| `clinicId` | UUID | Tenant-ключ |
| `supplierId` | UUID | FK → Supplier |
| `number` | String | Номер заказа (SO-XXXX) |
| `status` | SupplierOrderStatus | draft / sent / received / cancelled |
| `totalCost` | Int | Сумма в гяпиках (кэш, пересчитывается при изменении позиций) |
| `sentAt` | Timestamptz? | Момент перехода в sent |
| `receivedAt` | Timestamptz? | Момент перехода в received |
| `emailDraft` | String? | Зарезервировано (v2) |
| `emailSentAt` | Timestamptz? | Зарезервировано (v2) |
| `createdById` | UUID | FK → User |
| `notes` | String? | Произвольный текст |

### `SupplierOrderItem` (обновлено в сессии 29)

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | PK |
| `clinicId` | UUID | Tenant-ключ |
| `supplierOrderId` | UUID | FK → SupplierOrder |
| `inventoryItemId` | UUID? | FK → InventoryItem (nullable, v1 — null) |
| `catalogItemId` | UUID? | FK → SupplierCatalogItem |
| `quantity` | Decimal(12,3) | Количество |
| `unitCost` | Int | Цена единицы в гяпиках |
| `nameSnapshot` | String | Название на момент создания позиции |
| `skuSnapshot` | String? | Артикул |
| `unitSnapshot` | String? | Единица измерения |
| `priceSnapshot` | Decimal(12,2) | Цена каталога (Decimal — исключение из правила Int) |
| `currencySnapshot` | Char(3) | Валюта |

Snapshot-поля фиксируют данные из каталога в момент добавления позиции — изменения каталога на них не влияют.

### Enum `SupplierOrderStatus`

```prisma
enum SupplierOrderStatus {
  draft
  sent      // переименовано из ordered в сессии 29
  received
  cancelled
}
```

## Tenant-безопасность

- `SupplierOrder` и `SupplierOrderItem` уже в `TENANT_MODELS` (до сессии 29).
- `tenantClient(clinicId)` автоматически инжектирует `clinicId` во все запросы.
- При добавлении позиции из каталога дополнительно проверяется `catalogItem.supplierId === order.supplierId`.
- `clinicId` всегда берётся из сессии, никогда из формы.

## Компоненты

| Компонент | Файл |
|---|---|
| `SupplierOrdersList` | `components/supplier-orders/SupplierOrdersList.tsx` |
| `OrderDetailCard` | `components/supplier-orders/OrderDetailCard.tsx` |
| `OrderItemsTable` | `components/supplier-orders/OrderItemsTable.tsx` |
| `AddCatalogItemForm` | `components/supplier-orders/AddCatalogItemForm.tsx` |
| `OrderStatusActions` | `components/supplier-orders/OrderStatusActions.tsx` |
| `OrderMessageBlock` | `components/supplier-orders/OrderMessageBlock.tsx` |
| `CreateOrderButton` | `components/supplier-orders/CreateOrderButton.tsx` |
| `AddToOrderButton` | `components/supplier-orders/AddToOrderButton.tsx` |

## Server Actions

Файл: `lib/actions/supplier-orders.ts`

| Action | Права | Описание |
|---|---|---|
| `createSupplierOrderDraft` | manage | Создать черновик для поставщика (или открыть существующий) → redirect |
| `addCatalogItemToSupplierOrder` | manage | Добавить позицию из каталога в черновик |
| `updateSupplierOrderItemQty` | manage | Изменить количество позиции |
| `removeSupplierOrderItem` | manage | Удалить позицию из черновика |
| `updateSupplierOrderNotes` | manage | Сохранить примечание к заказу |
| `markSupplierOrderSent` | manage | draft → sent (требует ≥1 позиции) |
| `markSupplierOrderReceived` | manage | sent → received |
| `cancelSupplierOrder` | manage | draft/sent → cancelled |
| `addCatalogItemToOrderFromSupplierPage` | manage | Со страницы поставщика: найти/создать черновик + добавить позицию → redirect |

**clinicId всегда берётся из сессии, никогда из формы.**

## Генерация текста сообщения

Функция `buildSupplierOrderMessage(order, items)` в `lib/supplier-orders.ts`:
- Формирует текст на AZ языке с перечнем позиций, ценами и итогом.
- Кнопка «Mesajı kopyala» копирует текст в буфер обмена (клиентский JS).
- Автоматическая отправка (WhatsApp API / email) — вне scope v1.

## Seed

Demo-данные в `prisma/seed.ts` (секция 17):
- Заказ **SO-DEMO-01** у поставщика «Demo Dental Təchizat», статус `sent`, 2 позиции.

## Миграция

`20260617120000_add_supplier_order_items_catalog`:
- Переименовывает `SupplierOrderStatus.ordered` → `sent`.
- Добавляет `sent_at` в `supplier_orders`.
- Делает `inventory_item_id` в `supplier_order_items` nullable.
- Добавляет `catalog_item_id` + snapshot-поля в `supplier_order_items`.
- Добавляет FK от `supplier_order_items` к `supplier_catalog_items`.

## Out of scope (v1)

- Автоматическая отправка email / WhatsApp.
- Движения склада при получении (v2 — «оприходовать заказ»).
- Платёжный процесс, счета-фактуры.
- Портал поставщика, публичные ссылки, PDF-печать.
- Связь `InventoryItem` ↔ `SupplierOrderItem` (inventoryItemId = null в v1).
- Разбор входящих счетов, approvals.

## Известные ограничения

- Один черновик на поставщика одновременно (`getOrCreateDraftSupplierOrder`).
- При добавлении из страницы поставщика количество фиксировано = 1 (изменяется в детальной странице заказа).
- Нет пагинации списка заказов (лимит 200).
