-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('pending', 'prepared', 'scheduled', 'dismissed');

-- CreateTable
CREATE TABLE "recall_tasks" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID,
    "treatment_item_id" UUID,
    "service_id" UUID,
    "due_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" "RecallStatus" NOT NULL DEFAULT 'pending',
    "prepared_at" TIMESTAMPTZ,
    "scheduled_appointment_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "recall_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recall_tasks_clinic_id_status_due_date_idx" ON "recall_tasks"("clinic_id", "status", "due_date");

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_treatment_item_id_fkey" FOREIGN KEY ("treatment_item_id") REFERENCES "treatment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_tasks" ADD CONSTRAINT "recall_tasks_scheduled_appointment_id_fkey" FOREIGN KEY ("scheduled_appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
