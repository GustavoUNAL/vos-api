-- Cierre de caja diario por empresa
CREATE TYPE "CashCloseStatus" AS ENUM ('DRAFT', 'CLOSED');

CREATE TABLE "cash_closes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "close_date" DATE NOT NULL,
    "status" "CashCloseStatus" NOT NULL DEFAULT 'DRAFT',
    "sales_total_cop" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchases_total_cop" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labor_total_cop" DECIMAL(14,2),
    "expected_cash_cop" DECIMAL(14,2),
    "opening_float_cop" DECIMAL(14,2),
    "counted_cash_cop" DECIMAL(14,2),
    "variance_cop" DECIMAL(14,2),
    "notes" TEXT,
    "closed_by_user_id" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_closes_company_close_date_key" ON "cash_closes"("company_id", "close_date");
CREATE INDEX "idx_cash_closes_company_id" ON "cash_closes"("company_id");
CREATE INDEX "idx_cash_closes_company_close_date" ON "cash_closes"("company_id", "close_date");

ALTER TABLE "cash_closes" ADD CONSTRAINT "cash_closes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_closes" ADD CONSTRAINT "cash_closes_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
