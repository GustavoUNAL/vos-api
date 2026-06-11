-- Descuento estructurado en ventas + comprobante (foto) en ventas y compras
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "discount_cop" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "discount_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "receipt_image_data_url" TEXT;

ALTER TABLE "purchase_lots"
  ADD COLUMN IF NOT EXISTS "receipt_image_data_url" TEXT;
