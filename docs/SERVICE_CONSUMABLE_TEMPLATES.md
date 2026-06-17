# Service Consumable Templates — Session 33

## What it is

`ServiceConsumableTemplate` maps a **Service** to its standard inventory consumables.
This is a **template only** — it defines expected material quantities per service but does NOT deduct stock.
Stock deduction from treatments will be implemented in **Session 34**.

## Data model

```
Service (1) ──── (N) ServiceConsumableTemplate (N) ──── (1) InventoryItem
```

Key fields per template row:

| Field | Type | Notes |
|---|---|---|
| `clinicId` | UUID NOT NULL | Always from session — tenant isolation |
| `serviceId` | UUID NOT NULL | Must belong to same clinic |
| `inventoryItemId` | UUID NOT NULL | Must belong to same clinic |
| `quantity` | DECIMAL(12,3) | > 0 |
| `unit` | TEXT | Base unit of item, or `"dose"` if `doseToBaseFactor` set |
| `allowOverride` | BOOLEAN | Default true — doctor can change qty |
| `isRequired` | BOOLEAN | Default true — required for the procedure |
| `note` | TEXT? | Optional free text |

Unique constraint: `(clinicId, serviceId, inventoryItemId)` — one item appears at most once per service.

## Unit field

- `unit` must match the inventory item's base unit (`item.unit`) — e.g. `"ədəd"`, `"ml"`, `"q"`
- `unit = "dose"` is allowed only if the inventory item has `doseToBaseFactor` set (Session 32 field)
- Conversion math (e.g. 1 dose = 2 ml) is stored on `InventoryItem.doseToBaseFactor`

## Tenant isolation

- `clinicId` is always injected from the server session (`requirePermission`)
- `tenantClient(clinicId)` auto-filters all queries — clinic A cannot read or write clinic B templates
- Super admin (`clinicId = null`) is blocked: action returns `{ error: "unauthorized" }` immediately

## Permissions

- View templates: `settings.view`
- Create / update / delete: `settings.manage`
- Super admin default role only has `platform.*` and `admin.*` — no settings access

## UI

Templates are managed per-service at `/settings/services/[id]`.
The services list page (`/settings/services`) shows a "Sərfiyyatlar" link per service row.

Detail page layout:
- Left card: list of templates (each row is an inline edit form + delete button)
- Right card: add form (item select, qty, unit, checkboxes, note)

## Examples

### Baxış (Check-up)
| Item | Qty | Unit |
|---|---|---|
| Stəkan | 1 | ədəd |
| Salfet | 1 | ədəd |
| Əlcək | 1 | cüt |
| Maska | 1 | ədəd |

### Kompozit plomba (Filling)
| Item | Qty | Unit |
|---|---|---|
| Anesteziya | 1 | dose (1 dose = 2 ml) |
| Kompozit | 2 | q |
| İynə | 1 | ədəd |
| Stəkan | 1 | ədəd |
| Əlcək | 1 | cüt |

## NOT implemented (future sessions)

- **Session 34** — Automatic stock deduction when a treatment item is created
- **Session 34** — Treatment consumable checklist (override qty per patient)
- **Session 35** — Consumable cost reports per service / per period

## Migration

`20260617160000_add_service_consumable_templates` — creates `service_consumable_templates` table.
