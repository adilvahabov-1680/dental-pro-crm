# Low Stock Alerts / Reorder Suggestions — Session 38

> **Session 39 update**: `/inventory/alerts` now also lets users (with `inventory.manage`)
> select eligible rows and create supplier order drafts directly from this page. See
> [LOW_STOCK_REORDER_DRAFTS.md](LOW_STOCK_REORDER_DRAFTS.md). The read-only model described
> below (statuses, formula, summary, filters) is unchanged.

Read-only visibility module poverh mövcud `InventoryItem.quantity`/`minQuantity`/`purchaseUnit`
sahələri. **No DB migration. No stock mutation. No automatic supplier order creation.**

## What it is

`/inventory/alerts` — filterable page showing materials that need attention (out of stock,
low stock, or trending toward low), with a suggested reorder quantity. Pure read model:
no writes, no `InventoryMovement` rows, no `SupplierOrder` created.

## Status calculation

Computed in `lib/low-stock.ts` → `computeAlertStatus(quantity, minQuantity)`. Priority order
(first match wins), same `out > low` precedence as the existing `inventoryStatus()` in
`lib/inventory.ts`, plus a new `warning` tier:

```
out_of_stock : quantity <= 0
low_stock    : quantity <= minQuantity
warning      : quantity <= minQuantity * 1.5
ok           : otherwise
```

If `minQuantity = 0` (not configured), only `out_of_stock` can ever trigger — `low_stock`/
`warning` thresholds collapse to 0, which `quantity <= 0` already covers. No special-casing
needed; the formula handles it naturally.

This is a **separate** status enum from `InventoryStatus` (`lib/inventory.ts`, used by
`LowStockPanel` and the dashboard card) — that one also has an `expiring` tier (expiry date)
which is out of scope here; this module is purely quantity-driven.

## Reorder suggestion formula

`calculateReorderSuggestion()` in `lib/low-stock.ts`:

```
suggestedBaseQuantity  = max(minQuantity * 2 - quantity, minQuantity)
suggestedPurchaseUnits = ceil(suggestedBaseQuantity / purchaseToBaseFactor)   — only if purchaseUnit is set
```

If `minQuantity <= 0`, no suggestion is meaningful → returns `{ suggestedBaseQuantity: 0,
suggestedPurchaseUnits: null }`.

Example (gloves): `quantity=8 pair`, `minQuantity=20 pair`, `purchaseUnit=qutu`,
`purchaseToBaseFactor=50` → `suggestedBaseQuantity = max(40-8,20) = 32` pair →
`suggestedPurchaseUnits = ceil(32/50) = 1` qutu.

The suggestion is **display-only** — it does not write to `InventoryItem`, does not create an
`InventoryMovement`, and does not create a `SupplierOrder`. The page footer always shows the
note *"Avtomatik sifariş yaradılmır — yalnız tövsiyədir."*

## Supplier visibility

`InventoryItem.supplierId → Supplier` is a direct FK that already existed (Session 10+) and is
shown when present (name + link to `/inventory/suppliers/[id]`). `SupplierCatalogItem` is
linked to `Supplier` only, **not** to `InventoryItem` — there is no catalog-item↔inventory-item
relation in the schema, so catalog info is **not applicable** here (not invented).

## UI

- `/inventory/alerts` — RSC page, GET-form filters (no JS), same convention as
  `/reports/consumables`.
- Summary cards: out of stock / low stock / warning / needs-attention counts
  (`getLowStockAlertSummary`, computed over **all** active items regardless of filter).
- Table columns: material (+ category), current qty, min qty, status badge, suggested
  reorder (+ purchase units if applicable), supplier (or "Təchizatçı təyin olunmayıb"),
  link to `/inventory/[id]`.
- Filters: `status` (`attention` default = out+low+warning, `all`, or one specific status),
  `q` (name search), `category`.
- Link added to `/inventory` page header: "Stok xəbərdarlıqları" (`Bell` icon).
- Existing `LowStockPanel` (sidebar on `/inventory` + dashboard) is untouched — it still shows
  the original `normal/low/out/expiring` status for its top-6 preview; this page is the
  dedicated, filterable, reorder-aware view.
- **Session 39**: the table is now rendered by `components/inventory/ReorderDraftForm.tsx`
  (a client component) instead of inline in the RSC page, so it can host the
  selection/quantity/submit controls — see LOW_STOCK_REORDER_DRAFTS.md. All
  `data-e2e-marker` values from this session are unchanged.

## Library layer

`lib/low-stock.ts` (new file — deliberately **not** named `listLowStockItems`/
`getLowStockSummary` as initially suggested, because those names already exist in
`lib/inventory.ts` with different return shapes; using distinct names avoids ambiguity):

- `computeAlertStatus(quantity, minQuantity): LowStockAlertStatus`
- `calculateReorderSuggestion(item): ReorderSuggestion`
- `listLowStockAlerts(user, params): Promise<LowStockAlertRow[]>`
- `getLowStockAlertSummary(user): Promise<LowStockAlertSummary>`

## Tenant isolation

- `clinicId` taken only from `user.clinicId` (session), never from client input.
- All queries via `tenantClient(user.clinicId)`.
- Super admin (`clinicId = null`) → every function returns empty/zeroed result (existing
  pattern, same as `lib/inventory.ts`, `lib/dashboard.ts`).

## Permissions

`inventory.view` — read-only page, `requirePermission("inventory.view")`. No new
`inventory.manage` action was added in this session (the page has no mutations).

## Notifications

No changes to `lib/notifications.ts` or the existing `inventory_low_stock` notification
(created only on `normal→low` transition in `lib/actions/inventory.ts` /
`lib/actions/inventory-corrections.ts`, see `docs/INVENTORY.md`). This session adds
**visibility**, not a new notification channel — no recurring job, no email/WhatsApp.

## Not implemented by design (future sessions)

- ~~Automatic supplier order creation from a suggestion~~ ✅ user-confirmed draft creation
  done in Session 39 (LOW_STOCK_REORDER_DRAFTS.md) — still no *automatic* (unconfirmed) order
  creation, no auto-send.
- Background/cron low-stock digest.
- AI-based demand forecasting.
- Editing `minQuantity`/stock from this page (read-only; edit via `/inventory/[id]`).
- Catalog-item ↔ inventory-item linkage (does not exist in schema; not invented here).

## E2E

`scripts/e2e-low-stock-alerts-check.ts` (27 checks): access control (auth guard, permission
guard), out-of-stock/low-stock/warning status text, OK-item hidden from default list,
reorder formula (plain + purchase-unit conversion), search/status/category filters, tenant
isolation, supplier visibility.

```bash
npm run e2e-low-stock-alerts-check
```
