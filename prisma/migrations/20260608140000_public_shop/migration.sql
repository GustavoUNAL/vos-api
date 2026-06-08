ALTER TYPE "SaleSource" ADD VALUE IF NOT EXISTS 'SHOP';

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "shop_slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "companies_shop_slug_key" ON "companies"("shop_slug") WHERE "shop_slug" IS NOT NULL;

CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ShopPaymentMethod" AS ENUM ('NEQUI', 'BREB');

CREATE TABLE IF NOT EXISTS "shop_orders" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "order_code" TEXT NOT NULL,
  "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "payment_method" "ShopPaymentMethod" NOT NULL,
  "customer_name" TEXT,
  "customer_phone" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "payment_ref" TEXT,
  "payment_link" TEXT,
  "payment_instructions" TEXT,
  "sale_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_orders_company_order_code_key" ON "shop_orders"("company_id", "order_code");
CREATE INDEX IF NOT EXISTS "idx_shop_orders_company_id" ON "shop_orders"("company_id");
CREATE INDEX IF NOT EXISTS "idx_shop_orders_status" ON "shop_orders"("status");

ALTER TABLE "shop_orders"
  ADD CONSTRAINT "shop_orders_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shop_orders"
  ADD CONSTRAINT "shop_orders_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "companies" SET "shop_slug" = 'arandano' WHERE "id" = 'seed-arandano-cafe-bar' AND "shop_slug" IS NULL;
