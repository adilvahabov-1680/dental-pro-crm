-- Session 33: service_consumable_templates — maps services to standard inventory consumables.
-- Template only; no stock deduction (Session 34).

CREATE TABLE "service_consumable_templates" (
    "id"                UUID NOT NULL,
    "clinic_id"         UUID NOT NULL,
    "service_id"        UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity"          DECIMAL(12,3) NOT NULL,
    "unit"              TEXT NOT NULL,
    "allow_override"    BOOLEAN NOT NULL DEFAULT true,
    "is_required"       BOOLEAN NOT NULL DEFAULT true,
    "note"              TEXT,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_consumable_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_consumable_templates_clinic_service_item_key"
        UNIQUE ("clinic_id", "service_id", "inventory_item_id")
);

-- Indexes
CREATE INDEX "service_consumable_templates_clinic_id_idx"         ON "service_consumable_templates"("clinic_id");
CREATE INDEX "service_consumable_templates_service_id_idx"        ON "service_consumable_templates"("service_id");
CREATE INDEX "service_consumable_templates_inventory_item_id_idx" ON "service_consumable_templates"("inventory_item_id");

-- Foreign keys
ALTER TABLE "service_consumable_templates"
    ADD CONSTRAINT "service_consumable_templates_clinic_id_fkey"
        FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_consumable_templates"
    ADD CONSTRAINT "service_consumable_templates_service_id_fkey"
        FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_consumable_templates"
    ADD CONSTRAINT "service_consumable_templates_inventory_item_id_fkey"
        FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
