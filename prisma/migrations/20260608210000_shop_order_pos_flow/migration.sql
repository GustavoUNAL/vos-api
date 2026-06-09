-- Flujo tienda → POS → entrega → cobro

CREATE TYPE "ShopOrderStatus_new" AS ENUM (
  'PENDING',
  'PREPARING',
  'DELIVERED',
  'PAID',
  'CANCELLED',
  'EXPIRED'
);

ALTER TABLE "shop_orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "shop_orders"
  ALTER COLUMN "status" TYPE "ShopOrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING_PAYMENT' THEN 'PENDING'::"ShopOrderStatus_new"
      ELSE "status"::text::"ShopOrderStatus_new"
    END
  );

DROP TYPE "ShopOrderStatus";
ALTER TYPE "ShopOrderStatus_new" RENAME TO "ShopOrderStatus";
ALTER TABLE "shop_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TYPE "ShopPaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';

ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "preparing_at" TIMESTAMPTZ;
ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ;
