-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'feedback_received';

-- CreateTable
CREATE TABLE "patient_feedbacks" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "treatment_item_id" UUID,
    "response_link_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "submitted_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "patient_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_feedbacks_response_link_id_key" ON "patient_feedbacks"("response_link_id");

-- CreateIndex
CREATE INDEX "patient_feedbacks_clinic_id_submitted_at_idx" ON "patient_feedbacks"("clinic_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_treatment_item_id_fkey" FOREIGN KEY ("treatment_item_id") REFERENCES "treatment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_response_link_id_fkey" FOREIGN KEY ("response_link_id") REFERENCES "patient_response_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
