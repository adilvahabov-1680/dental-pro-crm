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
draft ──confirm──► approved ──sent──► received  (terminal)
  │                    │                │
  └── cancelled ◄──────┴── cancelled ◄──┘
       (terminal)
```

- `draft` → `approved`: explicit confirm action (`confirmSupplierOrderDraftAction`,
  сессия 40) — требует ≥1 позиции. Не отправляет, не меняет склад. См.
  SUPPLIER_ORDER_DRAFT_APPROVAL.md.
- `draft` → `sent` ИЛИ `approved` → `sent`: только при наличии хотя бы одной позиции
  (`markSupplierOrderSent` принимает оба статуса — подтверждение опционально, не обязательный
  гейт).
- `draft` / `approved` → `cancelled`: в любое время.
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
| `status` | SupplierOrderStatus | draft / approved / sent / received / cancelled |
| `totalCost` | Int | Сумма в гяпиках (кэш, пересчитывается при изменении позиций) |
| `orderedAt` | Timestamptz? | Момент подтверждения (draft→approved, сессия 40 — поле существовало с самого начала, но было неиспользуемым) |
| `sentAt` | Timestamptz? | Момент перехода в sent |
| `receivedAt` | Timestamptz? | Момент перехода в received |
| `emailDraft` | String? | Зарезервировано (v2) |
| `emailSentAt` | Timestamptz? | Зарезервировано (v2) |
| `createdById` | UUID | FK → User |
| `notes` | String? | Произвольный текст |

### `SupplierOrderItem` (обновлено в сессиях 29–30)

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | PK |
| `clinicId` | UUID | Tenant-ключ |
| `supplierOrderId` | UUID | FK → SupplierOrder |
| `inventoryItemId` | UUID? | FK → InventoryItem (заполняется при оприходовании) |
| `catalogItemId` | UUID? | FK → SupplierCatalogItem |
| `quantity` | Decimal(12,3) | Количество |
| `unitCost` | Int | Цена единицы в гяпиках |
| `nameSnapshot` | String | Название на момент создания позиции |
| `skuSnapshot` | String? | Артикул |
| `unitSnapshot` | String? | Единица измерения |
| `priceSnapshot` | Decimal(12,2) | Цена каталога (Decimal — исключение из правила Int) |
| `currencySnapshot` | Char(3) | Валюта |
| `receivedQty` | Decimal(12,3)? | Фактически принятое количество (сессия 30) |
| `receivedAt` | Timestamptz? | Момент оприходования (сессия 30) |
| `receivedById` | UUID? | Кто оприходовал (сессия 30) |
| `stockMovementId` | UUID? | FK → InventoryMovement (idempotency guard; сессия 30) |

Snapshot-поля фиксируют данные из каталога в момент добавления позиции — изменения каталога на них не влияют.

### Enum `SupplierOrderStatus`

```prisma
enum SupplierOrderStatus {
  draft
  approved  // добавлено в сессии 40 (migration 20260619000000)
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
| `createSupplierOrderDraftsFromLowStockAction` (Session 39, `lib/actions/low-stock-reorder.ts`) | manage | С `/inventory/alerts`: выбранные low-stock материалы → группировка по supplierId → черновик(и) с позициями `inventoryItemId` (без catalogItemId). См. LOW_STOCK_REORDER_DRAFTS.md |
| `confirmSupplierOrderDraftAction` (сессия 40) | manage | draft → approved (требует ≥1 позиции). Не отправляет, не меняет склад. См. SUPPLIER_ORDER_DRAFT_APPROVAL.md |

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

`20260619000000_add_supplier_order_approved_status` (сессия 40):
- `ALTER TYPE "SupplierOrderStatus" ADD VALUE 'approved';` — единственное изменение.

## Получение на склад (сессия 30)

После перевода в `received` каждую позицию можно оприходовать отдельно через кнопку
«Anbara qəbul et». Подробности — **SUPPLIER_RECEIVING.md**.

## Out of scope

- Автоматическая отправка email / WhatsApp.
- Платёжный процесс, счета-фактуры.
- Портал поставщика, публичные ссылки, PDF-печать.
- Частичные / многопартийные поставки.
- Разбор входящих счетов.
- ~~Approval flow~~ ✅ базовое подтверждение draft→approved сделано в сессии 40
  (SUPPLIER_ORDER_DRAFT_APPROVAL.md) — многоуровневое/ролевое согласование не входит в v1.

## Известные ограничения

- Один черновик на поставщика одновременно (`getOrCreateDraftSupplierOrder`).
- При добавлении из страницы поставщика количество фиксировано = 1 (изменяется в детальной странице заказа).
- Нет пагинации списка заказов (лимит 200).

## Reorder draft из Low Stock Alerts (сессия 39)

`SupplierOrderItem.inventoryItemId` (nullable FK, существовал с сессии 30 для receiving)
теперь может заполняться **на этапе создания** позиции, не только при оприходовании —
`createSupplierOrderDraftsFromLowStockAction` создаёт позиции напрямую из `InventoryItem`
(snapshot-поля копируются оттуда, `catalogItemId = null`). `OrderItemsTable` и
`ReceiveOrderItemForm` рендерятся по snapshot-полям и не зависят от того, как позиция была
создана — полная совместимость без изменений в этих компонентах. Подробности —
LOW_STOCK_REORDER_DRAFTS.md.
