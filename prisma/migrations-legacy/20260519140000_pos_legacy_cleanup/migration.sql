-- Limpieza de esquema POS anterior (tables/orders UUID) si existía

DROP TABLE IF EXISTS "order_payments" CASCADE;
DROP TABLE IF EXISTS "order_items" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "tables" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;

DROP TYPE IF EXISTS "PosPaymentMethod";
DROP TYPE IF EXISTS "TableStatus";
DROP TYPE IF EXISTS "AuditEntityType";
DROP TYPE IF EXISTS "AuditAction";

-- Recrear enum PosOrderStatus si quedó la versión antigua (OPEN, PAID, CANCELED)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'PosOrderStatus' AND e.enumlabel = 'CANCELED'
  ) THEN
    ALTER TYPE "PosOrderStatus" RENAME TO "PosOrderStatus_old";
    CREATE TYPE "PosOrderStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'PAID');
    ALTER TABLE "pos_orders" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "pos_orders"
      ALTER COLUMN "status" TYPE "PosOrderStatus"
      USING (
        CASE "status"::text
          WHEN 'PAID' THEN 'PAID'
          WHEN 'CANCELED' THEN 'CLOSED'
          ELSE 'OPEN'
        END
      )::"PosOrderStatus";
    ALTER TABLE "pos_orders" ALTER COLUMN "status" SET DEFAULT 'OPEN';
    DROP TYPE "PosOrderStatus_old";
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
