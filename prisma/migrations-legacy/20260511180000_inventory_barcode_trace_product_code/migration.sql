-- Código interno escaneable por ítem; código de producto reutilizable entre lotes (trazabilidad).
ALTER TABLE "inventory" ADD COLUMN "internal_barcode" TEXT;
ALTER TABLE "inventory" ADD COLUMN "trace_product_code" TEXT;

CREATE UNIQUE INDEX "inventory_internal_barcode_key" ON "inventory"("internal_barcode");

CREATE INDEX "idx_inventory_trace_product_code" ON "inventory"("trace_product_code");
