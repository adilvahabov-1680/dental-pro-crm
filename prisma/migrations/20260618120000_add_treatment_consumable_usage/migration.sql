-- Add treatment_usage to MovementType enum
ALTER TYPE "MovementType" ADD VALUE 'treatment_usage';

-- Create treatment_consumable_usages table
CREATE TABLE "treatment_consumable_usages" (
    "id"                    UUID            NOT NULL,
    "clinic_id"             UUID            NOT NULL,
    "treatment_item_id"     UUID            NOT NULL,
    "service_id"            UUID,
    "inventory_item_id"     UUID            NOT NULL,
    "template_id"           UUID,
    "quantity"              DECIMAL(12,3)   NOT NULL,
    "unit"                  TEXT            NOT NULL,
    "base_quantity"         DECIMAL(12,3)   NOT NULL,
    "base_unit"             TEXT            NOT NULL,
    "allow_override"        BOOLEAN         NOT NULL DEFAULT true,
    "is_required"           BOOLEAN         NOT NULL DEFAULT true,
    "was_skipped"           BOOLEAN         NOT NULL DEFAULT false,
    "note"                  TEXT,
    "inventory_movement_id" UUID,
    "created_by_id"         UUID            NOT NULL,
    "created_at"            TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_consumable_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "treatment_consumable_usages_movement_key" UNIQUE ("inventory_movement_id")
);

CREATE INDEX "treatment_consumable_usages_clinic_id_idx"
    ON "treatment_consumable_usages"("clinic_id");

CREATE INDEX "treatment_consumable_usages_treatment_item_id_idx"
    ON "treatment_consumable_usages"("treatment_item_id");

CREATE INDEX "treatment_consumable_usages_inventory_item_id_idx"
    ON "treatment_consumable_usages"("inventory_item_id");

CREATE INDEX "treatment_consumable_usages_inventory_movement_id_idx"
    ON "treatment_consumable_usages"("inventory_movement_id");

ALTER TABLE "treatment_consumable_usages"
    ADD CONSTRAINT "treatment_consumable_usages_clinic_id_fkey"
        FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "treatment_consumable_usages"
    ADD CONSTRAINT "treatment_consumable_usages_treatment_item_id_fkey"
        FOREIGN KEY ("treatment_item_id") REFERENCES "treatment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "treatment_consumable_usages"
    ADD CONSTRAINT "treatment_consumable_usages_inventory_item_id_fkey"
        FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treatment_consumable_usages"
    ADD CONSTRAINT "treatment_consumable_usages_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "service_consumable_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "treatment_consumable_usages"
    ADD CONSTRAINT "treatment_consumable_usages_inventory_movement_id_fkey"
        FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session 58 (CI migration-ordering fix): relocated verbatim from
-- 20260618100805_add_consumable_reversal, which originally ran BEFORE this
-- migration (100805 < 120000) and referenced this table before it existed —
-- failed with P3018 on a from-zero apply (fresh CI database). Statement
-- text/order below is unchanged from the original migration; only its file
-- location moved. See docs/CI_E2E_STRATEGY.md and docs/SESSION_HANDOFF.md §7.36.

-- DropIndex
DROP INDEX "treatment_consumable_usages_inventory_movement_id_idx";

-- AlterTable
ALTER TABLE "treatment_consumable_usages" ADD COLUMN     "is_reversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reversal_movement_id" UUID,
ADD COLUMN     "reversal_reason" TEXT,
ADD COLUMN     "reversed_at" TIMESTAMPTZ,
ADD COLUMN     "reversed_by_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "treatment_consumable_usages_is_reversed_idx" ON "treatment_consumable_usages"("is_reversed");

-- RenameIndex
ALTER INDEX "treatment_consumable_usages_movement_key" RENAME TO "treatment_consumable_usages_inventory_movement_id_key";
