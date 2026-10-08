CREATE TYPE "StockMoveType" AS ENUM ('SALE', 'PURCHASE', 'WASTE', 'ADJUSTMENT', 'COUNT');

CREATE TABLE "stock_moves" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_cost" DECIMAL(14,2),
    "qty_before" DECIMAL(14,4),
    "cost_before" DECIMAL(14,2),
    "note" TEXT,
    "sale_id" TEXT,
    "purchase_lot_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_stock_moves_company_created" ON "stock_moves"("company_id", "created_at");
CREATE INDEX "idx_stock_moves_item" ON "stock_moves"("inventory_item_id");
CREATE INDEX "idx_stock_moves_sale" ON "stock_moves"("sale_id");
CREATE INDEX "idx_stock_moves_lot" ON "stock_moves"("purchase_lot_id");

ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_purchase_lot_id_fkey" FOREIGN KEY ("purchase_lot_id") REFERENCES "purchase_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El cierre automático copiaba el efectivo esperado como si alguien lo hubiera contado.
-- Esos días (23:59, sin usuario, diferencia cero) vuelven a quedar pendientes de arqueo.
UPDATE "cash_closes"
SET "counted_cash_cop" = NULL,
    "variance_cop" = NULL
WHERE "closed_by_user_id" IS NULL
  AND "variance_cop" = 0
  AND "counted_cash_cop" IS NOT NULL
  AND "expected_cash_cop" IS NOT NULL
  AND "counted_cash_cop" = "expected_cash_cop"
  AND "closed_at" IS NOT NULL
  AND EXTRACT(HOUR FROM ("closed_at" AT TIME ZONE 'America/Bogota')) = 23
  AND EXTRACT(MINUTE FROM ("closed_at" AT TIME ZONE 'America/Bogota')) = 59;
