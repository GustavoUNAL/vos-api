-- Dental clinic tables
CREATE TABLE IF NOT EXISTS "dental_sites" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_patients" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "site_id" TEXT,
    "full_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'cc',
    "document_number" TEXT NOT NULL,
    "birth_date" DATE,
    "gender" TEXT,
    "blood_type" TEXT,
    "marital_status" TEXT,
    "occupation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Colombia',
    "insurer" TEXT,
    "coverage" TEXT,
    "notes" TEXT,
    "clinical_history" JSONB,
    "odontogram" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_appointments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "site_id" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "kind" TEXT NOT NULL DEFAULT 'tratamiento',
    "status" TEXT NOT NULL DEFAULT 'confirmada',
    "room" TEXT DEFAULT 'CONSULTORIO 1',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_incomes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "site_id" TEXT,
    "number" INTEGER NOT NULL,
    "income_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Creado',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_incomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "site_id" TEXT,
    "expense_date" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "provider" TEXT,
    "expense_type" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Registrado',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_sterilizations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "site_id" TEXT,
    "load_date" TIMESTAMPTZ(6) NOT NULL,
    "equipment" TEXT,
    "cycle" TEXT,
    "result" TEXT NOT NULL DEFAULT 'OK',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_sterilizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_wastes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "site_id" TEXT,
    "waste_date" DATE NOT NULL,
    "waste_type" TEXT NOT NULL,
    "classification" TEXT,
    "bag_color" TEXT,
    "weight_kg" DECIMAL(10,3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_wastes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dental_temp_humidity_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "site_id" TEXT,
    "log_date" DATE NOT NULL,
    "device_name" TEXT,
    "temperature_c" DECIMAL(6,2),
    "humidity_pct" DECIMAL(6,2),
    "observations" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dental_temp_humidity_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dental_patients_company_doc_key" ON "dental_patients"("company_id", "document_number");
CREATE INDEX IF NOT EXISTS "idx_dental_patients_company" ON "dental_patients"("company_id");
CREATE INDEX IF NOT EXISTS "idx_dental_patients_name" ON "dental_patients"("company_id", "full_name");
CREATE INDEX IF NOT EXISTS "idx_dental_sites_company" ON "dental_sites"("company_id");
CREATE INDEX IF NOT EXISTS "idx_dental_appointments_company_starts" ON "dental_appointments"("company_id", "starts_at");
CREATE UNIQUE INDEX IF NOT EXISTS "dental_incomes_company_number_key" ON "dental_incomes"("company_id", "number");
CREATE INDEX IF NOT EXISTS "idx_dental_incomes_company_date" ON "dental_incomes"("company_id", "income_date");
CREATE INDEX IF NOT EXISTS "idx_dental_expenses_company_date" ON "dental_expenses"("company_id", "expense_date");
CREATE INDEX IF NOT EXISTS "idx_dental_sterilizations_company_date" ON "dental_sterilizations"("company_id", "load_date");
CREATE INDEX IF NOT EXISTS "idx_dental_wastes_company_date" ON "dental_wastes"("company_id", "waste_date");
CREATE INDEX IF NOT EXISTS "idx_dental_temp_logs_company_date" ON "dental_temp_humidity_logs"("company_id", "log_date");

DO $$ BEGIN
  ALTER TABLE "dental_sites" ADD CONSTRAINT "dental_sites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_patients" ADD CONSTRAINT "dental_patients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_patients" ADD CONSTRAINT "dental_patients_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_appointments" ADD CONSTRAINT "dental_appointments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_appointments" ADD CONSTRAINT "dental_appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "dental_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_appointments" ADD CONSTRAINT "dental_appointments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_incomes" ADD CONSTRAINT "dental_incomes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_incomes" ADD CONSTRAINT "dental_incomes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "dental_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_incomes" ADD CONSTRAINT "dental_incomes_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_expenses" ADD CONSTRAINT "dental_expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_expenses" ADD CONSTRAINT "dental_expenses_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_sterilizations" ADD CONSTRAINT "dental_sterilizations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_sterilizations" ADD CONSTRAINT "dental_sterilizations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_wastes" ADD CONSTRAINT "dental_wastes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_wastes" ADD CONSTRAINT "dental_wastes_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_temp_humidity_logs" ADD CONSTRAINT "dental_temp_humidity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dental_temp_humidity_logs" ADD CONSTRAINT "dental_temp_humidity_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "dental_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
