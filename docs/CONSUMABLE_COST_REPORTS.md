# Consumable Cost Reports — Session 35

## What it is

Read-only report at `/reports/consumables` showing the actual material costs
derived from `TreatmentConsumableUsage` records (Session 34 — the factual
deductions, NOT the templates).

## Permission

`inventory.view` — accessible to: owner, admin, doctor.
Accountant and reception do not have `inventory.view` by default.
Super admin (`clinicId = null`) cannot access (returns no clinic data).

## Cost calculation rule

```
lineCostGapik = round(baseQuantity × InventoryItem.unitCost)
```

- `baseQuantity` — from `TreatmentConsumableUsage.baseQuantity` (already
  converted to base unit at application time)
- `unitCost` — CURRENT value of `InventoryItem.unitCost` (gapiks)
- If `unitCost = null` → line cost treated as **0**; UI shows "Qiymət yoxdur"
  marker
- **v1 uses the current `unitCost` at report generation time.**
  Historical cost snapshot (cost at the moment of deduction) is **not
  implemented** and left as future work.

## Only factual records counted

Only `TreatmentConsumableUsage` rows where:
- `wasSkipped = false`
- `inventoryMovementId IS NOT NULL`
- `isReversed = false`

are counted in the report. Skipped rows and reversed rows are excluded.
Reversal movements (`treatment_usage_reversal`) are preserved for audit but do not
appear in cost totals.

## Report sections

| Section | Data |
|---|---|
| Summary cards | total cost, usage row count, unique treatments, missing unitCost count |
| By inventory item | per-material total qty, unitCost, total cost |
| By service | per-service treatment count, total cost, avg cost |
| By doctor | per-doctor treatment count, total cost, avg cost |
| Recent usages | latest 50 rows with patient / doctor / service / material / line cost |

## Filters

URL params: `from`, `to` (YYYY-MM-DD), `doctor` (doctorId), `service` (serviceId).
All filters are optional and combinable.
Filter form uses HTML `<form method="GET">` — no JS required.

## Navigation

Link available from `/inventory` page header (BarChart3 icon, "Sərfiyyat hesabatı").

**"Müalicəyə keç" link** (Session 37): each row in the recent usages table has a link
to `/treatments/{treatmentItemId}/consumables` so the user can navigate directly from
the cost report to the specific treatment's consumables page.
`data-e2e-marker="report-go-to-treatment-{usageId}"` on the link cell.

## Tenant isolation

- `clinicId` injected from session via `requirePermission("inventory.view")`
- `tenantClient(clinicId)` auto-filters all Prisma reads
- Super admin (`clinicId = null`) returns empty result from every function
  (early return before any query)

## NOT implemented by design (future sessions)

- Historical unit cost snapshot (cost at deduction time)
- Excel / PDF export
- Profitability analytics (revenue − material cost)
- Payroll / doctor salary reports
- Supplier reorder automation
