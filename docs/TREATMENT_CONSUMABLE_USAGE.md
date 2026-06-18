# Treatment Consumable Usage — Sessions 34 + 37

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
| `isReversed` | true = reversed (Session 36) |
| `reversedAt` / `reversedById` / `reversalReason` / `reversalMovementId` | Reversal audit fields (Session 36) |

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

**Treatment card status badges** (Session 37 — `getConsumableStatusMap` in `lib/treatment-consumables.ts`):
- `applied` — at least one active non-reversed usage
- `reversed` — all usages reversed, no active ones
- `reapplied` — some reversed + some active (after re-apply)
- `none` — no non-skipped usages with movement

Badge computed by `getConsumableStatusMap(user, itemIds)` — single bulk query, not N+1.
Shown on `/treatments` and `/patients/[id]/treatments` pages via `consumableStatusBadges` prop on `TreatmentItemsList`.

**Consumables page detail** (Session 37):
Each usage row shows:
- Material name, qty in prescribed unit → base qty in base unit (if unit ≠ baseUnit)
- Status label: active / reversed / skipped (`data-e2e-marker="usage-status-{itemId}"`)
- Movement marker (last 8 chars of movementId), createdAt, createdByName (`data-e2e-marker="usage-audit-{itemId}"`)
- For reversed usages: reversedAt, reversedByName, reversalReason, reversal movement marker

**"Sərfiyyat tarixçəsi" audit trail section** (`data-e2e-marker="audit-trail-section"`):
Timeline showing Step 1 (first apply), Step 2 (reversal, if any), Step 3 (re-apply, if any).
Built from `existingUsages` data in the client component — no extra query.

## NOT implemented (future sessions)

- ~~**Session 35** — Cost reports per service / per period~~ ✅ done
- ~~**Session 36** — Full reversal of all usages~~ ✅ done
- ~~**Session 37** — Audit visibility: badges, detail rows, audit trail, movement labels~~ ✅ done
- Partial reversal of individual usage lines (v1 = full reversal only)
- Profitability analytics per doctor
- Automatic supplier reorder on low-stock
