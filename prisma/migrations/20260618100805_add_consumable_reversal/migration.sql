-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'treatment_usage_reversal';

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_stock_movement_id_fkey";

-- DropIndex
DROP INDEX "service_consumable_templates_inventory_item_id_idx";

-- AlterTable
ALTER TABLE "service_consumable_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "supplier_order_items" ALTER COLUMN "name_snapshot" DROP DEFAULT,
ALTER COLUMN "price_snapshot" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "service_consumable_templates_clinic_service_item_key" RENAME TO "service_consumable_templates_clinic_id_service_id_inventory_key";

-- Session 58 (CI migration-ordering fix): the 4 statements that used to be here
-- (DropIndex/AlterTable/CreateIndex/RenameIndex on "treatment_consumable_usages")
-- were relocated, verbatim, to the end of migration
-- 20260618120000_add_treatment_consumable_usage — that table did not exist yet
-- at this point in migration history on a from-zero apply (e.g. a fresh CI
-- database), causing `prisma migrate deploy` to fail with P3018. See
-- docs/CI_E2E_STRATEGY.md and docs/SESSION_HANDOFF.md §7.36 for the full
-- root-cause writeup. This migration's net effect on an already-applied
-- database is unchanged — only the statement order across the two files
-- was corrected.
