# Supplier Reorder Draft from Low Stock — Session 39

Lets a user select low-stock items on `/inventory/alerts` and create one or more
**supplier order drafts** in a single click, pre-filled with the Session 38 reorder
suggestion. **User-confirmed only** — nothing is sent, received, or paid automatically.

## What it is

- On `/inventory/alerts`, eligible rows (those with a `supplierId`) get a checkbox and an
  editable quantity input (defaulting to `suggestedBaseQuantity`).
- Submitting creates/extends a `draft` `SupplierOrder` per supplier, with one
  `SupplierOrderItem` per selected `InventoryItem`.
- The user then continues through the **existing** Supplier Orders flow
  (`draft → sent → received`, see `docs/SUPPLIER_ORDERS.md`) — this session only adds the
  draft-creation shortcut.

## What it does NOT do

- Does NOT send the order to the supplier (no email/WhatsApp automation).
- Does NOT mark the order as `sent`/`received`.
- Does NOT mutate `InventoryItem.quantity`.
- Does NOT create an `InventoryMovement`.
- Does NOT forecast demand or use AI — quantities come from the existing Session 38 formula,
  overridable by the user before submitting.

## No schema changes

`SupplierOrder.status` already has `draft` as its default (Session 29). `SupplierOrderItem`
already has a nullable `inventoryItemId` FK alongside `catalogItemId` (Session 30, added for
the receiving flow) — this session is the first to *write* it directly at creation time
instead of only at receiving time. No migration was needed.

## Grouping by supplier (v1 = variant A)

If the user selects items from multiple suppliers in one submission, the action groups them
by `supplierId` and creates **one draft per supplier** (not a single mixed order, and not a
hard block). Each supplier's draft reuses the existing pattern from
`getOrCreateDraftSupplierOrder` (`lib/supplier-orders.ts`): if a `draft` order already exists
for that supplier, items are added/merged into it rather than creating a duplicate order
(same "one draft per supplier at a time" rule as the rest of the Supplier Orders module).

## Quantity

- Default = `suggestedBaseQuantity` from `lib/low-stock.ts`'s `calculateReorderSuggestion`
  (Session 38 formula: `max(minQuantity*2 - quantity, minQuantity)`).
- The quantity input is **editable** before submission — the user's typed value is what gets
  saved on the `SupplierOrderItem`, not the suggestion. Validated as a positive decimal
  (≤ 3 decimal places), same convention as other order-item quantity fields.
- If an item already exists on the target draft order (e.g. submitted twice across two
  reorder-draft runs), the quantities are **added together** — same merge behavior as
  `addCatalogItemToSupplierOrder`.

## SupplierOrderItem fields populated

Mirrors the snapshot pattern used everywhere else in Supplier Orders — `nameSnapshot`,
`skuSnapshot`, `unitSnapshot`, `priceSnapshot`, `currencySnapshot` are captured from the
`InventoryItem` at creation time (not live-linked), `catalogItemId` stays `null`,
`inventoryItemId` is set directly (no catalog item involved). `currencySnapshot` is always
`"AZN"` (the only currency `InventoryItem.unitCost` is stored in).

## Items without a supplier are excluded

`InventoryItem.supplierId` is the only signal used (direct FK, already existed). There is no
`SupplierCatalogItem` ↔ `InventoryItem` relation in the schema, so catalog matching is not
attempted — an item with no `supplierId` shows "Təchizatçı seçilməyib", its checkbox is
disabled, and it cannot be included in a draft. This is not a guess or invented relation —
it's the literal absence of data.

## Library layer

`lib/low-stock-reorder.ts` (new, read-only):
- `buildReorderDraftPreview(user, itemIds)` — clinicId-scoped; loads the given inventory items,
  computes each one's reorder suggestion, and groups by supplier. Items without a supplier go
  into `excludedNoSupplier`. Used internally by the server action to validate/group the
  selection (no separate preview UI step in v1 — the alerts table itself *is* the preview).

`lib/actions/low-stock-reorder.ts` (new, server action):
- `createSupplierOrderDraftsFromLowStockAction` — parses the submitted `items[N].*` fields
  (same flat-FormData convention as `applyTreatmentConsumablesAction`), filters to selected
  rows, calls `buildReorderDraftPreview` to group + validate, then for each supplier group:
  gets-or-creates the draft order, upserts order items, recalculates the order total.
  Returns `{ createdOrders: [{ orderId, orderNumber, supplierName, isNew }] }` for the UI to
  render "Sifarişə keç" links.

## Permissions

`inventory.manage` — same permission that already gates every other Supplier Orders mutation
(`createSupplierOrderDraft`, `addCatalogItemToSupplierOrder`, etc. in
`lib/actions/supplier-orders.ts`). No new permission was added. The checkbox/quantity/submit
UI is hidden entirely for users with `inventory.view` but not `inventory.manage` (e.g.
doctor) — defense in depth on top of the server-side `requirePermission` check.

## Tenant isolation

- `clinicId` comes only from `requirePermission("inventory.manage")` → session, never from
  the form.
- `buildReorderDraftPreview` queries via `tenantClient(user.clinicId)` — an item id from
  another clinic simply isn't found and silently drops out of the result (same pattern as the
  rest of the app); it cannot end up on a draft order.
- Super admin (`clinicId = null`) → action returns `{ error: "unauthorized" }` immediately.

## UI

`components/inventory/ReorderDraftForm.tsx` (client component) replaces the previously
server-rendered table on `/inventory/alerts` with the same table plus:
- a checkbox + quantity column (only rendered when `canManage`),
- an optional note textarea (applied to newly-created orders only — does not overwrite notes
  on an order that already existed),
- a "Təchizatçıya görə qruplaşdırılacaq" hint when the current selection spans more than one
  supplier,
- a success panel listing every created/updated order with a "Sifarişə keç" link,
- a permanent "Avtomatik göndərilmir" note next to the submit button.

All existing Session 38 markers (`alert-row-*`, `alert-suggested-*`, `alert-supplier-*`,
`alert-go-to-item-*`, `alerts-table`) are preserved unchanged.

## A note on a bug found and fixed during this session

The original `formatQty` helper lived in `lib/inventory.ts`, a server-only module (it
transitively imports `lib/tenant.ts` → `lib/auth.ts` → `next/headers`). Moving the alerts
table into a `"use client"` component and importing `formatQty` from `lib/inventory` pulled
that entire server-only chain into the client bundle, which Next.js rejects at compile time.
Fixed by moving `formatQty` to `lib/utils.ts` (already the home for other pure formatters like
`formatMoney`/`formatDate`) and re-exporting it from `lib/inventory.ts` for the existing
server-component call sites, while the new client component imports it directly from
`lib/utils.ts`. No other behavior changed.

## Not implemented by design (future sessions)

- Automatic sending of the created draft (email/WhatsApp) — still a manual "Mesajı kopyala"
  step via the existing order detail page.
- Automatic receiving — still a separate, explicit "Anbara qəbul et" step
  (`docs/SUPPLIER_RECEIVING.md`).
- AI-based demand forecasting.
- Payment / finance automation.
- A dedicated preview/wizard screen before creation (v1 uses the alerts table itself as the
  preview, per the "don't overload the UI" requirement).

## E2E

`scripts/e2e-low-stock-reorder-drafts-check.ts` (31 checks): access control (controls hidden
for view-only roles, anonymous redirect, no-permission rejection), eligible vs.
no-supplier items, suggested-quantity default + override, single-supplier merge into one
order, multi-supplier grouping into separate orders, no stock/movement side effects, order
list/detail visibility, tenant isolation, super-admin safety.

```bash
npm run e2e-low-stock-reorder-drafts-check
```
