-- Fecha de modificación declarada para trazabilidad (editable por API; distinta de updated_at automático).
ALTER TABLE "products" ADD COLUMN "trace_modified_at" TIMESTAMPTZ(6);

ALTER TABLE "purchase_lots" ADD COLUMN "trace_modified_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_products_trace_modified_at" ON "products"("trace_modified_at");

CREATE INDEX "idx_purchase_lots_trace_modified_at" ON "purchase_lots"("trace_modified_at");
