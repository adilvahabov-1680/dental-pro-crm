-- CreateTable
CREATE TABLE "treatment_protocols" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "treatment_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_protocol_steps" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "protocol_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "order_index" SMALLINT NOT NULL,
    "duration_min" SMALLINT,
    "interval_days" SMALLINT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "treatment_protocol_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_protocols_clinic_id_idx" ON "treatment_protocols"("clinic_id");

-- CreateIndex
CREATE INDEX "treatment_protocol_steps_clinic_id_protocol_id_idx" ON "treatment_protocol_steps"("clinic_id", "protocol_id");

-- AddForeignKey
ALTER TABLE "treatment_protocols" ADD CONSTRAINT "treatment_protocols_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_protocol_steps" ADD CONSTRAINT "treatment_protocol_steps_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_protocol_steps" ADD CONSTRAINT "treatment_protocol_steps_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "treatment_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_protocol_steps" ADD CONSTRAINT "treatment_protocol_steps_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
