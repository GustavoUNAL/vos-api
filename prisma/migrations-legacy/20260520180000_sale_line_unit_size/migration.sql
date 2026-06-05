-- Unidad/tamaño por defecto en producto y detalle por línea de venta.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_unit" TEXT;

ALTER TABLE "sale_lines" ADD COLUMN IF NOT EXISTS "line_unit" TEXT;
ALTER TABLE "sale_lines" ADD COLUMN IF NOT EXISTS "line_size" TEXT;
