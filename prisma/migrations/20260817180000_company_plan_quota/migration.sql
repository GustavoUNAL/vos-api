-- Trial vs Pro: cupo de espacio y plan por empresa.
-- Las empresas que ya existen pasan a PRO para no cortar operación actual.
-- Las nuevas (DEFAULT TRIAL) quedan en prueba.

DO $$ BEGIN
  CREATE TYPE "CompanyPlan" AS ENUM ('TRIAL', 'PRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "plan" "CompanyPlan" NOT NULL DEFAULT 'TRIAL';

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "storage_limit_bytes" INTEGER NOT NULL DEFAULT 26214400;

UPDATE "companies" SET "plan" = 'PRO';
