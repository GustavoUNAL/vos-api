-- Comentarios por línea de comprobante (producto dentro del lote).
ALTER TABLE "purchase_lot_lines" ADD COLUMN IF NOT EXISTS "line_comment" TEXT;
