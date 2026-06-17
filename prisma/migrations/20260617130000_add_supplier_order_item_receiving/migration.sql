-- AlterTable: supplier_order_items — add receiving tracking fields
ALTER TABLE "supplier_order_items"
  ADD COLUMN "received_qty"       DECIMAL(12,3),
  ADD COLUMN "received_at"        TIMESTAMPTZ,
  ADD COLUMN "received_by"        UUID,
  ADD COLUMN "stock_movement_id"  UUID;

-- AddForeignKey: stock_movement_id → inventory_movements
ALTER TABLE "supplier_order_items"
  ADD CONSTRAINT "supplier_order_items_stock_movement_id_fkey"
  FOREIGN KEY ("stock_movement_id") REFERENCES "inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
