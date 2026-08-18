DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "service_projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "charged_amount" DECIMAL(14,2) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "service_projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_service_projects_company_status"
  ON "service_projects"("company_id", "status");

CREATE INDEX IF NOT EXISTS "idx_service_projects_company_created"
  ON "service_projects"("company_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "service_projects"
    ADD CONSTRAINT "service_projects_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
