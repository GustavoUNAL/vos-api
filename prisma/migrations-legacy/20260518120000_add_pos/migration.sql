-- POS (contrato vos-front): mesas, órdenes, líneas y pagos

CREATE TYPE "PosTableStatus" AS ENUM ('FREE', 'OCCUPIED', 'RESERVED', 'CLOSING');
CREATE TYPE "PosOrderStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'PAID');

CREATE TABLE "pos_tables" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "guest_count" INTEGER,
    "status" "PosTableStatus" NOT NULL DEFAULT 'FREE',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos_tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_tables_number_key" ON "pos_tables"("number");
CREATE INDEX "idx_pos_tables_status" ON "pos_tables"("status");
CREATE INDEX "idx_pos_tables_section" ON "pos_tables"("section");
CREATE INDEX "idx_pos_tables_deleted_at" ON "pos_tables"("deleted_at");

CREATE TABLE "pos_orders" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "PosOrderStatus" NOT NULL DEFAULT 'OPEN',
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "subtotal_cop" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_cop" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_cop" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "sale_id" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "pos_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "pos_orders_sale_id_key" ON "pos_orders"("sale_id");
CREATE INDEX "idx_pos_orders_table_id" ON "pos_orders"("table_id");
CREATE INDEX "idx_pos_orders_status" ON "pos_orders"("status");
CREATE INDEX "idx_pos_orders_user_id" ON "pos_orders"("user_id");
CREATE INDEX "idx_pos_orders_opened_at" ON "pos_orders"("opened_at");
CREATE INDEX "idx_pos_orders_paid_at" ON "pos_orders"("paid_at");
CREATE INDEX "idx_pos_orders_deleted_at" ON "pos_orders"("deleted_at");

CREATE UNIQUE INDEX "uq_pos_orders_active_per_table"
  ON "pos_orders"("table_id")
  WHERE "status" IN ('OPEN', 'CLOSING') AND "deleted_at" IS NULL;

CREATE TABLE "pos_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,0) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos_order_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_order_lines" ADD CONSTRAINT "pos_order_lines_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_order_lines" ADD CONSTRAINT "pos_order_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_pos_order_lines_order_id" ON "pos_order_lines"("order_id");
CREATE INDEX "idx_pos_order_lines_product_id" ON "pos_order_lines"("product_id");

CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount_cop" DECIMAL(18,0) NOT NULL,
    "tip_cop" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_pos_payments_order_id" ON "pos_payments"("order_id");
CREATE INDEX "idx_pos_payments_method" ON "pos_payments"("method");
