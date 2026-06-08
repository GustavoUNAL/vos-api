-- CreateEnum
CREATE TYPE "ProductCostSource" AS ENUM ('MANUAL', 'RECIPE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "cost_source" "ProductCostSource" NOT NULL DEFAULT 'MANUAL';
