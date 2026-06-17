-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "supplier_catalog_items" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "unit" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AZN',
    "min_order_qty" DECIMAL(12,3),
    "availability" TEXT,
    "source_row" INTEGER,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "supplier_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_catalog_items_clinic_id_idx" ON "supplier_catalog_items"("clinic_id");

-- CreateIndex
CREATE INDEX "supplier_catalog_items_supplier_id_idx" ON "supplier_catalog_items"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_catalog_items_clinic_id_name_idx" ON "supplier_catalog_items"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "supplier_catalog_items_clinic_id_is_active_idx" ON "supplier_catalog_items"("clinic_id", "is_active");

-- AddForeignKey
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
