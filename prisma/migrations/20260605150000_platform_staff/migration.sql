-- CreateEnum
CREATE TYPE "StaffShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "id_number" TEXT,
    "default_hourly_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "shift_date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "hourly_rate_cop" DECIMAL(14,2) NOT NULL,
    "hours_worked" DECIMAL(8,4),
    "total_pay_cop" DECIMAL(14,2),
    "status" "StaffShiftStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_staff_members_company_id" ON "staff_members"("company_id");

-- CreateIndex
CREATE INDEX "idx_staff_members_company_active" ON "staff_members"("company_id", "active");

-- CreateIndex
CREATE INDEX "idx_staff_shifts_company_id" ON "staff_shifts"("company_id");

-- CreateIndex
CREATE INDEX "idx_staff_shifts_staff_member_id" ON "staff_shifts"("staff_member_id");

-- CreateIndex
CREATE INDEX "idx_staff_shifts_company_shift_date" ON "staff_shifts"("company_id", "shift_date");

-- CreateIndex
CREATE INDEX "idx_staff_shifts_shift_date" ON "staff_shifts"("shift_date");

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
