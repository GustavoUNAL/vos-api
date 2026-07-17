-- Gastos operativos mensuales (agua, energía, internet)
CREATE TYPE "OperatingExpenseKind" AS ENUM ('AGUA', 'ENERGIA', 'INTERNET', 'OTHER');

CREATE TABLE "operating_expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" "OperatingExpenseKind" NOT NULL,
    "expense_month" DATE NOT NULL,
    "amount_cop" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operating_expenses_company_kind_month_key" ON "operating_expenses"("company_id", "kind", "expense_month");
CREATE INDEX "idx_operating_expenses_company_id" ON "operating_expenses"("company_id");
CREATE INDEX "idx_operating_expenses_company_month" ON "operating_expenses"("company_id", "expense_month");

ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
