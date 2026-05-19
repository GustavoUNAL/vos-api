-- Columnas de catálogo POS / costo en productos (estaban en schema.prisma sin migración).
ALTER TABLE "products" ADD COLUMN "sku" TEXT;
ALTER TABLE "products" ADD COLUMN "unit_cost" DECIMAL(12,2);

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "idx_products_sku" ON "products"("sku");
