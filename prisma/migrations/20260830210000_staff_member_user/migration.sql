-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_staff_members_user_id" ON "staff_members"("user_id");

-- Unique per company when linked to a login
CREATE UNIQUE INDEX "staff_members_company_user_unique" ON "staff_members"("company_id", "user_id") WHERE "user_id" IS NOT NULL;
