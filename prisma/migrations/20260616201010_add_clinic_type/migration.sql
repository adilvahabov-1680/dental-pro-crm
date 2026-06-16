-- CreateEnum
CREATE TYPE "ClinicType" AS ENUM ('clinic', 'solo_doctor');

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "clinic_type" "ClinicType" NOT NULL DEFAULT 'clinic';
