# Treatment Consumable Reversal — Session 36

## What it is

Full reversal of all active consumable usages applied to a treatment item.
Used when a doctor or assistant made an error (wrong material, wrong quantity,
wrong treatment item, accidental template apply).

## What reversal does

1. Finds all `TreatmentConsumableUsage` rows for the treatment item where:
   - `wasSkipped = false`
   - `inventoryMovementId IS NOT NULL`
   - `isReversed = false`
2. For each such usage, atomically:
   - Creates an `InventoryMovement` with type `treatment_usage_reversal`
   - Returns `baseQuantity` to `InventoryItem.quantity`
   - Marks the usage: `isReversed = true`, `reversedAt`, `reversedById`, `reversalReason`, `reversalMovementId`
3. All writes happen in a single PostgreSQL transaction with per-item advisory locks.

## What reversal does NOT do

- Does NOT delete the original `TreatmentConsumableUsage` record.
- Does NOT delete or modify the original `InventoryMovement`.
- Does NOT reverse skipped usages (no stock was deducted, nothing to return).
- Does NOT perform partial reversal of a single usage line (v1 = full reversal only).

## Double reversal protection

A second reversal attempt on the same treatment item returns
`{ error: "noConsumablesToReverse" }` because no active non-reversed usages exist.

## Re-apply after reversal

After a full reversal, the double-apply guard checks `isReversed = false`,
so the apply form becomes available again and consumables can be re-applied
with corrected quantities or materials.

## Permission

`treatments.manage` — same as the apply flow.
Super admin (`clinicId = null`) is blocked (returns `unauthorized`).

## Reason field

`reason` is required (minimum 3 characters). Stored on each reversed usage as
`reversalReason` and on the reversal `InventoryMovement` as `reason`.

## Tenant isolation

- `clinicId` from session via `requirePermission("treatments.manage")`
- `tenantClient(clinicId)` auto-scopes all reads
- Treatment item ownership verified before reversal

## Reports compatibility

`TreatmentConsumableUsage` rows with `isReversed = true` are excluded from
the consumable cost report (`/reports/consumables`) via `isReversed: false`
in `buildWhere`. Reversed usages do not inflate material costs.

## Data model changes (Session 36 migration)

New fields on `TreatmentConsumableUsage`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `isReversed` | Boolean | false | Set to true on reversal |
| `reversedAt` | DateTime? | null | UTC timestamp of reversal |
| `reversedById` | String? | null | User ID who performed reversal |
| `reversalReason` | String? | null | Mandatory reason text |
| `reversalMovementId` | String? | null | FK to reversal InventoryMovement |

New `MovementType` enum value: `treatment_usage_reversal`

## UI visibility (Session 37)

Reversal details are displayed in `TreatmentConsumableChecklist` (client component):

- Each reversed usage row shows: `reversedAt`, `reversedByName`, `reversalReason`,
  reversal movement marker (`id.slice(-8)`) — `data-e2e-marker="reversal-detail-{itemId}"`
- Audit trail section `data-e2e-marker="audit-trail-section"` shows:
  - Step 2 reversal block: `data-e2e-marker="audit-reversal-step"` — lists reversed rows
    with `labels.stockReturned`, reason, reversedByName
  - Step 3 re-apply block: `data-e2e-marker="audit-reapply-step"` — if active rows exist
    after reversal (re-applied case)
- Treatment card badges (`none` / `applied` / `reversed` / `reapplied`) visible on
  `/treatments` and `/patients/[id]/treatments`
- `treatment_usage_reversal` movement type shows as "Sərfiyyat geri qaytarma" on
  `/inventory/[id]` page via `MOVEMENT_TYPE_META`

## NOT implemented by design (future sessions)

- Partial reversal of a single usage line
- Editing quantity after reversal (reverse → re-apply with new qty is the workflow)
- Cost correction / historical cost snapshot
