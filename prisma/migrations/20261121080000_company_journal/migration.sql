-- Diario por empresa

CREATE TABLE "company_journal_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_journal_company_updated" ON "company_journal_entries"("company_id", "updated_at");

ALTER TABLE "company_journal_entries" ADD CONSTRAINT "company_journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_journal_entries" ADD CONSTRAINT "company_journal_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
