-- Clientes y códigos legibles V### / D### en ventas

CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");
CREATE INDEX "idx_clients_name" ON "clients"("name");
CREATE INDEX "idx_clients_active" ON "clients"("active");

ALTER TABLE "sales" ADD COLUMN "code" TEXT;
ALTER TABLE "sales" ADD COLUMN "client_id" TEXT;

CREATE UNIQUE INDEX "sales_code_key" ON "sales"("code");
CREATE INDEX "idx_sales_client_id" ON "sales"("client_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_lines" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "sale_lines_code_key" ON "sale_lines"("code");
