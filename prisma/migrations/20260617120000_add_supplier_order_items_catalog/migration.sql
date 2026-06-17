-- AlterEnum: rename `ordered` → `sent` in SupplierOrderStatus
-- USING clause remaps existing `ordered` rows to `sent` before casting to the new enum type.
-- Without this CASE, rows with status='ordered' would cause:
--   ERROR: invalid input value for enum "SupplierOrderStatus_new": "ordered"
BEGIN;
CREATE TYPE "SupplierOrderStatus_new" AS ENUM ('draft', 'sent', 'received', 'cancelled');
ALTER TABLE "public"."supplier_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "supplier_orders" ALTER COLUMN "status" TYPE "SupplierOrderStatus_new"
  USING (
    CASE WHEN "status"::text = 'ordered' THEN 'sent'::"SupplierOrderStatus_new"
         ELSE "status"::text::"SupplierOrderStatus_new"
    END
  );
ALTER TYPE "SupplierOrderStatus" RENAME TO "SupplierOrderStatus_old";
ALTER TYPE "SupplierOrderStatus_new" RENAME TO "SupplierOrderStatus";
DROP TYPE "public"."SupplierOrderStatus_old";
ALTER TABLE "supplier_orders" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_inventory_item_id_fkey";

-- AlterTable: supplier_order_items — add snapshot fields + catalogItemId, make inventoryItemId nullable
ALTER TABLE "supplier_order_items"
  ADD COLUMN "catalog_item_id" UUID,
  ADD COLUMN "currency_snapshot" CHAR(3) NOT NULL DEFAULT 'AZN',
  ADD COLUMN "name_snapshot" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "price_snapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sku_snapshot" TEXT,
  ADD COLUMN "unit_snapshot" TEXT,
  ALTER COLUMN "inventory_item_id" DROP NOT NULL;

-- AlterTable: supplier_orders — add sentAt
ALTER TABLE "supplier_orders" ADD COLUMN "sent_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "supplier_order_items_clinic_id_idx" ON "supplier_order_items"("clinic_id");

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "supplier_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
