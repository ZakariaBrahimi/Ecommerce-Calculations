-- AlterTable
ALTER TABLE "daily_spend" ADD COLUMN     "purchase_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN     "purchases" INTEGER NOT NULL DEFAULT 0;
