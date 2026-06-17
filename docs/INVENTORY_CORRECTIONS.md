# Inventory Stock Corrections / Audit v1 (сессия 31)

Ручные корректировки остатков склада. Каждое изменение `InventoryItem.quantity`
проходит через `InventoryMovement` — полный audit trail с причиной, пользователем и временем.

## Зачем нужны корректировки

После Session 30 товары принимаются на склад через supplier receiving. Корректировки нужны для:

- пересчёт склада (обнаружена нехватка или излишек);
- списание испорченного / истёкшего материала;
- потеря / хищение;
- ошибка количества при предыдущем вводе.

**Прямое изменение `InventoryItem.quantity` без движения склада запрещено.**

## Типы корректировок

| Тип движения    | UI-метка                    | Знак | Описание                                 |
|-----------------|----------------------------|------|------------------------------------------|
| `adjustment`    | Düzəliş (artırma)          | +    | Ручное увеличение: излишек при пересчёте |
| `adjustment_out`| Düzəliş (azalma)           | −    | Ручное уменьшение: недостача при пересчёте |
| `write_off`     | Silinmə / xarab / itki     | −    | Списание: испорчен, истёк, утерян        |

Типы `in_stock` (supplier receiving) и `out_stock` (списание на процедуру) — не используются
в correction workflow; они управляются своими dedicated server actions.

## Маршрут и UI

Форма «Stok düzəlişi» находится на странице детали материала:

```
/inventory/[id]
```

Форма рендерится только при наличии разрешения `inventory.manage`.

### UX-поведение

- Три кнопки выбора типа: «Artırma» / «Azaltma» / «Silinmə / xarab / itki».
- Отображается текущий остаток (`Mövcud qalıq: X ədəd`).
- Поле «Miqdar» — обязательное, >0.
- Поле «Səbəb» — обязательное, минимум 3 символа.
- Поле «Qeyd» — необязательное; хранится в `InventoryMovement.note`.
- Для `adjustment_out` и `write_off` — клиентский `window.confirm` перед отправкой.
- Success / error toast в форме (без page reload).

## Права доступа

| Роль              | Просмотр истории | Корректировка |
|-------------------|-----------------|---------------|
| owner / admin     | ✓               | ✓             |
| doctor            | ✓               | —             |
| assistant/others  | —               | —             |

Permission check: `inventory.manage` в `requirePermission`.

## Tenant-безопасность

- `clinicId` всегда берётся из server session (`requirePermission`), никогда из FormData.
- Внутри транзакции запрос к `InventoryItem` фильтрует по `clinicId` — перекрёстный tenant невозможен.
- Super admin с `clinicId = null` получает `{ error: "unauthorized" }` — мутация clinic inventory заблокирована.

## Server action

Файл: `lib/actions/inventory-corrections.ts`

```typescript
adjustInventoryItemStock(_prev, formData): Promise<InventoryFormState>
```

**Алгоритм:**
1. `requirePermission("inventory.manage")` → получить `user` с `clinicId`.
2. `if (!user.clinicId) return { error: "unauthorized" }`.
3. Validate `stockCorrectionSchema` (itemId, type, quantity, reason, note).
4. `prisma.$transaction`:
   a. Advisory lock: `pg_advisory_xact_lock(hashtext("inv:" + itemId))::text`.
   b. Fetch `InventoryItem` where `id = itemId AND clinicId = clinicId`.
   c. Рассчитать новое `quantity`; если отрицательное → throw `insufficientStock`.
   d. `inventoryMovement.create` с `type`, `quantity`, `reason`, `note`, `performedById`.
   e. `inventoryItem.update { quantity: next }`.
5. `auditLog.create`.
6. `revalidatePath` для item page и списка.
7. `return { success: "correctionSuccess" }`.

## Валидация

Файл: `lib/validation/inventory.ts` — `stockCorrectionSchema`

| Поле     | Тип    | Правило                          |
|----------|--------|----------------------------------|
| itemId   | UUID   | обязательный                     |
| type     | enum   | `adjustment | adjustment_out | write_off` |
| quantity | Decimal| > 0, ≤ 1 000 000                 |
| reason   | string | мин. 3 символа, макс. 500        |
| note     | string?| необязательный, макс. 2000       |

## Модель данных

### Новые типы `MovementType` (сессия 31)

```prisma
enum MovementType {
  in_stock       @map("in")
  out_stock      @map("out")
  adjustment                   // ручное увеличение
  adjustment_out               // ручное уменьшение (добавлено в сессии 31)
  write_off                    // списание
}
```

### Новое поле `InventoryMovement.note`

```prisma
model InventoryMovement {
  ...
  reason  String?   // причина (обязательна для корректировок)
  note    String?   // дополнительный комментарий (добавлено в сессии 31)
  ...
}
```

### История движений

`listItemMovements` (lib/inventory.ts) возвращает `note` в `MovementRow`.
`InventoryMovementsList` отображает `note` как курсивный подтекст под строкой движения.
Лимит истории поднят с 20 до 50 записей.

## Миграция

`20260617140000_add_inventory_correction_types`:

```sql
ALTER TYPE "MovementType" ADD VALUE 'adjustment_out';
ALTER TABLE "inventory_movements" ADD COLUMN "note" TEXT;
```

## E2E

Скрипт: `scripts/e2e-inventory-corrections-check.ts`

```bash
npx tsx scripts/e2e-inventory-corrections-check.ts
# или
npm run e2e-inventory-corrections-check
```

Покрывает: setup, auth guard, permission guard, ADJUSTMENT_IN, ADJUSTMENT_OUT, WRITE_OFF,
required reason, negative stock protection, tenant isolation, super admin safety, audit integrity,
history UI. Тест сам создаёт и удаляет E2E-CORR-* данные.

## Out of scope (будущие сессии)

- **Session 32** — Inventory Units & Conversion v1
- **Session 33** — Service Consumable Templates v1
- **Session 34** — Treatment Consumable Usage v1 (автоматическое списание расходников по лечению)
- **Session 35** — Consumable Cost Reports v1

Автоматическое списание расходников по лечению — НЕ входит в Session 31 и реализуется в Session 34.
