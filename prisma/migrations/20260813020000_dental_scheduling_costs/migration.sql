-- Scheduling + costs for dental clinic
CREATE TABLE IF NOT EXISTS "dental_procedures" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "unit_price" DECIMAL(14,2) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_procedures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_budgets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendiente',
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_financings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "budget_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "initial_payment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL DEFAULT 0,
    "installment_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'en_tramite',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_financings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dental_appointments" ADD COLUMN IF NOT EXISTS "procedure_id" TEXT;
ALTER TABLE "dental_appointments" ADD COLUMN IF NOT EXISTS "procedure_name" TEXT;
ALTER TABLE "dental_appointments" ADD COLUMN IF NOT EXISTS "estimated_cost" DECIMAL(14,2);
ALTER TABLE "dental_appointments" ADD COLUMN IF NOT EXISTS "charged_amount" DECIMAL(14,2);
ALTER TABLE "dental_appointments" ADD COLUMN IF NOT EXISTS "duration_min" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "dental_incomes" ADD COLUMN IF NOT EXISTS "appointment_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_dental_procedures_company_active" ON "dental_procedures"("company_id", "active");
CREATE INDEX IF NOT EXISTS "idx_dental_budgets_company_status" ON "dental_budgets"("company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_dental_financings_company_status" ON "dental_financings"("company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_dental_incomes_appointment" ON "dental_incomes"("appointment_id");

DO $$ BEGIN
  ALTER TABLE "dental_procedures" ADD CONSTRAINT "dental_procedures_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_budgets" ADD CONSTRAINT "dental_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_budgets" ADD CONSTRAINT "dental_budgets_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "dental_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_budgets" ADD CONSTRAINT "dental_budgets_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "dental_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_financings" ADD CONSTRAINT "dental_financings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_financings" ADD CONSTRAINT "dental_financings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "dental_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_financings" ADD CONSTRAINT "dental_financings_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "dental_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_appointments" ADD CONSTRAINT "dental_appointments_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "dental_procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_incomes" ADD CONSTRAINT "dental_incomes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "dental_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
