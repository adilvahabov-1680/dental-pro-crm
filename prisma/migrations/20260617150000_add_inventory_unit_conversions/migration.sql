-- Session 32: add purchase unit conversion fields to inventory_items.
-- unit (existing) remains the base/storage unit.
-- purchase_unit: unit used when ordering from supplier (e.g. "qutu"); null = same as unit.
-- purchase_to_base_factor: how many base units one purchase unit contains (e.g. 100 for a box of 100 pieces).
-- dose_to_base_factor: how many base units one dose contains (optional, for clinical dispensing).
ALTER TABLE "inventory_items"
  ADD COLUMN "purchase_unit" TEXT,
  ADD COLUMN "purchase_to_base_factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
  ADD COLUMN "dose_to_base_factor" DECIMAL(12,4);
