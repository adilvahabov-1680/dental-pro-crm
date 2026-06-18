# Treatment Consumable Usage — Session 34

## What it is

`TreatmentConsumableUsage` records the actual consumable materials used per treatment item,
based on `ServiceConsumableTemplate` definitions (Session 33).
When applied, it deducts stock via `InventoryMovement` (type `treatment_usage`).

## Data model

```
TreatmentItem (1) ──── (N) TreatmentConsumableUsage (N) ──── (1) InventoryItem
                                    │
                         (optional) ServiceConsumableTemplate
                                    │
                         (optional) InventoryMovement
```

Key fields per usage row:

| Field | Notes |
|---|---|
| `clinicId` | Always from session — tenant isolation |
| `treatmentItemId` | Must belong to same clinic |
| `inventoryItemId` | Must belong to same clinic |
| `templateId` | Nullable — links back to the template used |
| `quantity` | In `unit` (may be "dose") |
| `unit` | Base unit of item or "dose" |
| `baseQuantity` | Actual deducted quantity in base unit |
| `baseUnit` | = InventoryItem.unit |
| `wasSkipped` | true = no stock deduction, no movement |
| `inventoryMovementId` | Unique FK — links to the movement that deducted stock |
| `createdById` | User who applied |

## Dose conversion

- `unit = item.unit` → `baseQuantity = quantity`, no conversion
- `unit = "dose"` → `baseQuantity = quantity × item.doseToBaseFactor`
  - `doseToBaseFactor` must be set and > 0 on the InventoryItem
- Any other unit → rejected

## Stock deduction

Each non-skipped item creates:
1. `InventoryMovement` with type `treatment_usage`, `quantity = baseQuantity`
2. Decrements `InventoryItem.quantity`
3. `TreatmentConsumableUsage` record with `inventoryMovementId` set

All writes happen inside a single PostgreSQL transaction with per-item advisory locks
(same pattern as `addInventoryMovement`). Insufficient stock aborts the entire transaction.

## Double-apply protection

If a `TreatmentConsumableUsage` with `wasSkipped = false`, non-null `inventoryMovementId`,
and `isReversed = false` already exists for the `treatmentItemId`, the action returns
`{ error: "alreadyApplied" }`. After a full reversal (all active usages reversed), the guard
clears and the apply form becomes available for re-apply.

## Required vs optional items

- `isRequired = true` → item cannot be skipped (action returns `requiredItemSkipped`)
- `isRequired = false` → skip checkbox visible in UI; skipped items create a usage record
  with `wasSkipped = true` but no `InventoryMovement`

## Tenant isolation

- `clinicId` injected from session via `requirePermission`
- `tenantClient(clinicId)` auto-filters all reads
- `TreatmentConsumableUsage` added to `TENANT_MODELS`
- Super admin (`clinicId = null`) blocked: action returns `{ error: "unauthorized" }`

## Permissions

- View page: `treatments.view`
- Apply consumables: `treatments.manage`
- Cancelled treatment items: apply blocked

## UI

Template checklist at `/treatments/[id]/consumables`.
Link (`FlaskConical` icon) shown in `TreatmentItemCard` for all non-cancelled items when `canManage`.

Detail page layout:
- If usages exist: shows applied list + "already applied" notice
- If not yet applied (canManage): shows template checklist with qty/unit/skip controls

## NOT implemented (future sessions)

- ~~**Session 35** — Cost reports per service / per period~~ ✅ done
- Partial reversal of individual usage lines (Session 36 = full reversal only)
- Profitability analytics per doctor
- Automatic supplier reorder on low-stock
