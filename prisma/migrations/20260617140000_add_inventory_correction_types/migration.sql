-- Add adjustment_out to MovementType enum
ALTER TYPE "MovementType" ADD VALUE 'adjustment_out';

-- Add note column to inventory_movements
ALTER TABLE "inventory_movements" ADD COLUMN "note" TEXT;
