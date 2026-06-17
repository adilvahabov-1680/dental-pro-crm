# Inventory Unit Conversions (Session 32)

## Overview

Each `InventoryItem` now stores three optional unit-conversion fields alongside the existing `unit` (base/storage unit):

| Field | DB column | Type | Default | Purpose |
|---|---|---|---|---|
| `unit` | `unit` | String | — | **Base unit** — all quantities stored in this unit (e.g. `ml`, `ədəd`, `cüt`) |
| `purchaseUnit` | `purchase_unit` | String? | `null` | Supplier ordering unit (e.g. `qutu`, `paket`); `null` = same as `unit` |
| `purchaseToBaseFactor` | `purchase_to_base_factor` | Decimal(12,4) | `1` | How many base units per purchase unit (e.g. 100 for a box of 100 pieces) |
| `doseToBaseFactor` | `dose_to_base_factor` | Decimal(12,4)? | `null` | How many base units per clinical dose (e.g. 2 ml per carpule); optional |

## Design decisions

- **`quantity` always in `unit` (base unit).**  All `InventoryMovement` records use base units. Stock corrections, receiving, and treatment material deductions are all in base units.
- **`unit` is the base unit** — it was renamed conceptually (no schema rename). Legacy code using `item.unit` continues to work unchanged.
- **`purchaseUnit = null`** means the item is ordered in base units (factor is implicitly 1).
- **`purchaseToBaseFactor`** is validated as `> 0`; zero and negative values are rejected with `factorInvalid`.
- **`doseToBaseFactor`** is optional; if provided it must also be `> 0`.

## Examples

| Material | unit | purchaseUnit | purchaseToBaseFactor | doseToBaseFactor |
|---|---|---|---|---|
| Стаканы | `ədəd` | `qutu` | `100` | — |
| Перчатки | `cüt` | `qutu` | `50` | — |
| Анестетик | `ml` | `karpul` | `1.8` | `0.3` |
| Бондинг | `ml` | — | `1` | — |

## UI

`/inventory/new` form has a collapsible **"Vahid çevrilməsi"** section:
- **Əsas vahid** (`unit`) — required; the storage/display unit
- **Alış vahidi** (`purchaseUnit`) — optional; left blank → same as base unit
- **1 alış vahidi neçə əsas vahiddir?** (`purchaseToBaseFactor`) — numeric > 0, default 1
- **1 doza neçə əsas vahiddir?** (`doseToBaseFactor`) — optional numeric > 0

`/inventory/[id]` detail page shows conversion rows when `purchaseUnit` or `doseToBaseFactor` is set.

## What was NOT implemented (out of scope)

- Dispensing unit separate from base unit
- Separate `Unit` model with predefined enum
- Service/protocol consumable templates
- Auto treatment material deduction using `doseToBaseFactor`
- Cost reports by dose
- Conversion in supplier receiving forms (user still enters received qty in base units)

## Migration

`20260617150000_add_inventory_unit_conversions/migration.sql` adds three nullable columns.
Existing rows get `purchaseUnit = NULL`, `purchaseToBaseFactor = 1`, `doseToBaseFactor = NULL` — fully backwards-compatible.
