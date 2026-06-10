-- Tareas diarias por empresa

CREATE TABLE "company_tasks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "task_date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_company_tasks_company_date" ON "company_tasks"("company_id", "task_date");
CREATE INDEX "idx_company_tasks_task_date" ON "company_tasks"("task_date");

ALTER TABLE "company_tasks" ADD CONSTRAINT "company_tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_tasks" ADD CONSTRAINT "company_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_tasks" ADD CONSTRAINT "company_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
