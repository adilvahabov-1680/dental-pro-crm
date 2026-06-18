# Supplier Order Draft Approval Flow — Session 40

Adds an explicit, user-confirmed approval step between "this is a draft" and "this has been
sent to the supplier." **Confirmation does not send anything, does not touch stock, does not
create an `InventoryMovement`, and does not receive goods.**

## What it is

`SupplierOrderStatus` gained one new value: `approved`, inserted between `draft` and `sent`:

```
draft ──confirm──► approved ──mark sent──► sent ──mark received──► received  (terminal)
  │                    │                     │
  └── cancel ◄─────────┴── cancel ◄──────────┘
       (terminal)
```

- `draft → approved`: explicit user action ("Sifarişi təsdiqlə"), requires ≥1 item.
- `approved → sent`: the **same existing** `markSupplierOrderSent` action (Session 29),
  whose precondition was widened from `status === "draft"` to `status === "draft" ||
  status === "approved"`. Users can still send directly from `draft` — confirmation is an
  optional clarity step, not a hard gate, to keep the existing draft→sent path working
  unchanged.
- `sent → received`, `cancel` from any non-terminal state: unchanged from Session 29-30.

## Migration

One additive enum value — `prisma/migrations/20260619000000_add_supplier_order_approved_status/`:

```sql
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'approved';
```

No other schema change. The confirm action reuses the **existing, previously-unused**
`SupplierOrder.orderedAt` timestamp column (it was selected in `lib/supplier-orders.ts` but
never written anywhere) to record "confirmed at" — no new column needed.

## Why not reuse an existing status?

`sent` already has its own distinct meaning tied to `sentAt` and the WhatsApp/email message
flow (`OrderMessageBlock`, `markSupplierOrderSent`). Reusing it for "internally confirmed"
would conflate "we decided to order this" with "we told the supplier" — the opposite of what
this session asks for (no automatic sending on confirm). `pending`/`created`/`ordered` do not
exist in the enum. A new minimal value was the only option that keeps the distinction clean.

## Server action

`confirmSupplierOrderDraftAction` (`lib/actions/supplier-orders.ts`):

- Input: `orderId`.
- `clinicId` only from `requirePermission("inventory.manage")` → session; returns
  `{ error: "unauthorized" }` if `clinicId` is null (super admin).
- Order must belong to the clinic (`tenantClient`-scoped lookup — cross-tenant ids simply
  aren't found).
- Order must be `status === "draft"` (else `{ error: "orderNotDraft" }` — reuses the existing
  error key/message).
- Order must have ≥1 item (else `{ error: "confirmEmpty" }` — "Sifarişdə ən azı bir məhsul
  olmalıdır").
- On success: `status: "approved"`, `orderedAt: new Date()`, audit log entry, revalidates
  the order detail/list pages and `/inventory/alerts`. Returns `{ orderId, success:
  "confirmSuccess" }`.
- No stock/`InventoryMovement` writes anywhere in this action.

## Receiving compatibility

Receiving was **already** blocked for non-`received` orders before this session
(`receiveSupplierOrderItem` requires `order.status === "received"`, and
`markSupplierOrderReceived` requires `status === "sent"` — `draft`/`approved` orders can
never reach `received` without going through `sent` first). This session adds one clearer
rejection message: attempting to receive an item whose order is still `draft` now returns
`{ error: "orderApprovalRequired" }` ("Qaralama sifariş qəbul edilə bilməz") instead of the
generic "not yet marked as received" message — same rejection, clearer wording.

## UI

`components/supplier-orders/OrderStatusActions.tsx`:
- **`draft`**: confirm button ("Sifarişi təsdiqlə") + success message on confirm, **plus** the
  pre-existing "Göndərildi kimi qeyd et" (mark sent) and "Sifarişi ləğv et" (cancel) buttons —
  kept for backward compatibility (`e2e-supplier-orders-check` already asserts the mark-sent
  form is visible on a draft order). A permanent "Avtomatik göndərilmir" note sits next to the
  confirm button.
- **`approved`** (new branch): "Göndərildi kimi qeyd et" + "Sifarişi ləğv et" — same actions as
  draft, minus the confirm button (already confirmed).
- **`sent`**: unchanged.

`components/supplier-orders/OrderDetailCard.tsx`:
- Draft-only explanatory note: "Bu sifariş hələ təsdiqlənməyib və avtomatik göndərilmir."
- Status badge map extended with `approved: "bg-info/15 text-info"` → label "Təsdiqlənib".
- New `orderedAt` row ("Təsdiq tarixi"), shown once set.

`components/supplier-orders/SupplierOrdersList.tsx`: same `approved` color added so the list
page shows it clearly too — no other change (status rendering was already generic).

**Items become read-only once approved**: `OrderItemsTable`'s existing `isDraft` gate
(`order.status === "draft"`) was left untouched on purpose — adding/removing/editing items is
only available while still a draft. Once confirmed, the order is locked in; to change it,
cancel and recreate. This wasn't explicitly requested but is a sensible default for an
"approval" concept and required no extra code.

## Low-stock reorder compatibility

Drafts created by `createSupplierOrderDraftsFromLowStockAction` (Session 39) are ordinary
`status: "draft"` orders — no special casing was needed. They show the same draft badge,
explanatory note, and confirm button, and confirming them works identically to any other
draft.

## Tenant isolation & permissions

- `inventory.manage` — same permission as every other Supplier Orders mutation. No new
  permission was added.
- `clinicId` only from session; `tenantClient` scoping means an order id from another clinic
  is simply not found by the confirm action (silently no-ops, same pattern as the rest of the
  app).
- Super admin (`clinicId = null`) blocked immediately.

## Not implemented by design (out of scope)

- Automatic supplier email/WhatsApp sending on confirm or on send.
- Automatic receiving / stock mutation of any kind.
- Payment or invoicing automation.
- Locking/unlocking edits is binary (draft = editable, everything else = locked) — no
  "approved but still editable" mode.

## E2E

`scripts/e2e-supplier-order-draft-approval-check.ts` (31 checks): draft visibility (badge,
note, confirm button, backward-compatible mark-sent/cancel forms), confirm action (status →
approved, `orderedAt` set, badge/UI updates), empty-draft protection, non-draft protection
(confirming an already-approved order is a no-op), receiving blocked for draft (server-side,
no movement, no stock change), no-automatic-sending check, low-stock draft compatibility
end-to-end, tenant isolation, permission enforcement (UI hidden + server rejected), super
admin safety.

```bash
npm run e2e-supplier-order-draft-approval-check
```
