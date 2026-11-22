-- Finanzas y calendario personales (Main). Datos en Neon; migrate deploy no los borra.

CREATE TYPE "PersonalMoneyKind" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "personal_money_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "kind" "PersonalMoneyKind" NOT NULL,
    "amount_cop" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "note" TEXT,
    "occurred_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "personal_money_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_personal_money_company_day" ON "personal_money_entries"("company_id", "occurred_on");

ALTER TABLE "personal_money_entries" ADD CONSTRAINT "personal_money_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_money_entries" ADD CONSTRAINT "personal_money_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "personal_calendar_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "personal_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_personal_calendar_company_start" ON "personal_calendar_events"("company_id", "starts_at");

ALTER TABLE "personal_calendar_events" ADD CONSTRAINT "personal_calendar_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_calendar_events" ADD CONSTRAINT "personal_calendar_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
