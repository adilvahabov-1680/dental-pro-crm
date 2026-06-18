-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'treatment_usage_reversal';

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_stock_movement_id_fkey";

-- DropIndex
DROP INDEX "service_consumable_templates_inventory_item_id_idx";

-- DropIndex
DROP INDEX "treatment_consumable_usages_inventory_movement_id_idx";

-- AlterTable
ALTER TABLE "service_consumable_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "supplier_order_items" ALTER COLUMN "name_snapshot" DROP DEFAULT,
ALTER COLUMN "price_snapshot" DROP DEFAULT;

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
ALTER INDEX "service_consumable_templates_clinic_service_item_key" RENAME TO "service_consumable_templates_clinic_id_service_id_inventory_key";

-- RenameIndex
ALTER INDEX "treatment_consumable_usages_movement_key" RENAME TO "treatment_consumable_usages_inventory_movement_id_key";
