# Supplier Receiving v1 (сессия 30)

Модуль оприходования заказов поставщика на склад.
Получение заказа в статус `received` (**`markSupplierOrderReceived`**) — отдельный шаг от
складских движений. Движение склада создаётся только явным действием «Anbara qəbul et» по
каждой позиции. Разовое: повторное получение одной позиции заблокировано.

## Маршруты

Extending `/inventory/supplier-orders/[id]` — на детальной странице заказа со статусом
`received` появляется колонка **«Anbara qəbul et»** в таблице позиций.

## Права доступа

| Роль | Может видеть страницу | Может получить на склад |
|---|---|---|
| owner / admin | ✓ | ✓ |
| doctor | ✓ | — |
| assistant | — | — |
| accountant / reception | — | — |

- `inventory.view` — просмотр страницы, статус получения.
- `inventory.manage` — форма «Anbara qəbul et», создание InventoryItem из снапшота.

## Бизнес-правила

1. Получение разрешено только если `order.status === "received"`.
2. Одна позиция = одно получение. Повторное заблокировано (`stockMovementId != null`).
3. Количество по умолчанию = `quantity` заказа; можно изменить вручную.
4. Пользователь выбирает **режим**:
   - **Выбрать существующий** — `InventoryItem` из выпадающего списка.
   - **Создать новый** — `InventoryItem` создаётся из snapshot-данных позиции.
5. После получения `SupplierOrderItem.inventoryItemId` указывает на целевой `InventoryItem`.

## Поля, добавленные на `SupplierOrderItem` (сессия 30)

| Поле | Тип | Описание |
|---|---|---|
| `receivedQty` | Decimal(12,3)? | Фактически принятое количество |
| `receivedAt` | Timestamptz? | Момент получения |
| `receivedById` | UUID? | Кто принял |
| `stockMovementId` | UUID? | FK → `inventory_movements.id`; `not null` = уже получено |

## Создание нового InventoryItem из снапшота

| InventoryItem поле | Источник |
|---|---|
| `name` | `nameSnapshot` |
| `sku` | `skuSnapshot` |
| `unit` | `unitSnapshot` ?? `"ədəd"` |
| `unitCost` | `round(priceSnapshot * 100)` (гяпики) |
| `quantity` | 0 (обновляется движением) |
| `minQuantity` | 0 |
| `supplierId` | supplier из order |
| `categoryId` | — (null, пользователь назначает позже) |

## Создание InventoryMovement

- `type`: `in_stock`
- `supplierOrderId`: FK на заказ (audit)
- `reason`: `"Anbar qəbulu: {orderNumber} ({supplierName})"`
- `unitCost`: из `priceSnapshot` (гяпики)
- `performedById`: из сессии

Движение создаётся внутри `prisma.$transaction` с advisory lock
`pg_advisory_xact_lock(hashtext('inv:' + inventoryItemId))::text`.

## Server Action

Файл: `lib/actions/supplier-receiving.ts`

| Action | Права | Описание |
|---|---|---|
| `receiveSupplierOrderItem` | manage | Оприходовать одну позицию заказа |

### Параметры формы

| Поле | Тип | Описание |
|---|---|---|
| `orderItemId` | UUID | ID позиции заказа |
| `inventoryItemId` | UUID? | Существующий материал (взаимоисключающее с `createNew`) |
| `createNew` | `"true"` | Создать новый материал из снапшота |
| `receivedQty` | numeric string | Фактическое количество |

**Возвращает** `{ success: "receiveSuccess" }` | `{ error: string }` | `{ fieldErrors: {...} }`.

## Компоненты

| Компонент | Файл |
|---|---|
| `ReceiveOrderItemForm` | `components/supplier-orders/ReceiveOrderItemForm.tsx` |
| `OrderItemsTable` (обновлён) | `components/supplier-orders/OrderItemsTable.tsx` |

`OrderItemsTable` принимает новый проп `inventoryItems?: InventoryItemFull[]` —
заполняется только для `received` + `canManage`.

## i18n-ключи (добавлены в `supplierOrders`)

```ts
receiveToInventory: "Anbara qəbul et"
receivedToInventory: "Anbara qəbul edildi"
notReceivedToInventory: "Qəbul edilməyib"
createInventoryItem: "Yeni material yarat"
selectInventoryItem: "Mövcud material seç"
receiveHint: "Standart miqdar — sifariş miqdarıdır."
alreadyReceived: "Artıq qəbul edilib"
receiveSuccess: "Material anbara uğurla qəbul edildi"
receiving: "Qəbul edilir…"
errors.orderNotReceived: "Sifariş hələ alınmış kimi qeyd edilməyib"
errors.orderItemAlreadyReceived: "Bu element artıq anbara qəbul edilib"
errors.inventoryItemNotFound: "Material tapılmadı"
errors.mustSelectOrCreate: "Material seçin və ya yeni yarat"
```

## Миграция

`20260617130000_add_supplier_order_item_receiving`:
- Добавляет 4 колонки в `supplier_order_items`.
- Добавляет FK `stock_movement_id → inventory_movements(id) ON DELETE SET NULL`.

## Seed

`prisma/seed.ts` секция 18:
- **SO-DEMO-02** у «Demo Dental Təchizat», статус `received`, 2 позиции, ещё не оприходованы.

## E2E

Скрипт: `scripts/e2e-supplier-receiving-check.ts`

16 проверок: auth guard, permission guard, order-not-received guard, double-receive guard,
create-new path (count+1 InventoryItem, qty=2, movement), link-existing path (qty += 3),
badge «Anbara qəbul edildi» после получения.

## Out of scope (v1)

- Частичные / многопартийные поставки.
- Автооприходование всего заказа одним кликом.
- Штрихкод / QR.
- Входящие счета, оплата, возвраты.
- Срок годности при приёмке.
- Долг перед поставщиком.
- PDF-квитанция.
