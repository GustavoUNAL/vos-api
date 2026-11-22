-- Main life OS: notas enriquecidas, ideas, bienestar, Vicente, presupuestos.

ALTER TABLE "company_journal_entries" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "company_journal_entries" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "personal_ideas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "personal_ideas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_personal_ideas_company_updated" ON "personal_ideas"("company_id", "updated_at");
ALTER TABLE "personal_ideas" ADD CONSTRAINT "personal_ideas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_ideas" ADD CONSTRAINT "personal_ideas_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "personal_wellness_checkins" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "health" INTEGER NOT NULL,
    "love" INTEGER NOT NULL,
    "friendships" INTEGER NOT NULL,
    "family" INTEGER NOT NULL,
    "note" TEXT,
    "checked_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personal_wellness_checkins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "personal_wellness_company_author_day_key" ON "personal_wellness_checkins"("company_id", "author_id", "checked_on");
CREATE INDEX "idx_personal_wellness_company_day" ON "personal_wellness_checkins"("company_id", "checked_on");
ALTER TABLE "personal_wellness_checkins" ADD CONSTRAINT "personal_wellness_checkins_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_wellness_checkins" ADD CONSTRAINT "personal_wellness_checkins_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "personal_assistant_messages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personal_assistant_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_personal_assistant_thread" ON "personal_assistant_messages"("company_id", "user_id", "created_at");
ALTER TABLE "personal_assistant_messages" ADD CONSTRAINT "personal_assistant_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_assistant_messages" ADD CONSTRAINT "personal_assistant_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "personal_money_budgets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "limit_cop" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "personal_money_budgets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "personal_money_budgets_company_cat_month_key" ON "personal_money_budgets"("company_id", "category", "month");
ALTER TABLE "personal_money_budgets" ADD CONSTRAINT "personal_money_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_money_budgets" ADD CONSTRAINT "personal_money_budgets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
