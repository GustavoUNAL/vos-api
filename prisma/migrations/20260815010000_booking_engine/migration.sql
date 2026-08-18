-- VOS AI Booking engine (generic appointments)

DO $$ BEGIN
  CREATE TYPE "BookingAppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BookingAppointmentSource" AS ENUM ('ADMIN', 'PUBLIC_BOOKING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "booking_settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "public_slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "slot_interval_min" INTEGER NOT NULL DEFAULT 15,
    "buffer_min" INTEGER NOT NULL DEFAULT 0,
    "public_enabled" BOOLEAN NOT NULL DEFAULT true,
    "welcome_message" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_settings_company_id_key" ON "booking_settings"("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_settings_public_slug_key" ON "booking_settings"("public_slug");

CREATE TABLE IF NOT EXISTS "booking_services" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "duration_min" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_services_company_active" ON "booking_services"("company_id", "active");

CREATE TABLE IF NOT EXISTS "booking_staff" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photo_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_staff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_staff_company_active" ON "booking_staff"("company_id", "active");

CREATE TABLE IF NOT EXISTS "booking_staff_services" (
    "staff_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    CONSTRAINT "booking_staff_services_pkey" PRIMARY KEY ("staff_id","service_id")
);

CREATE TABLE IF NOT EXISTS "booking_customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_customers_company_phone_key" ON "booking_customers"("company_id", "phone");
CREATE INDEX IF NOT EXISTS "idx_booking_customers_company" ON "booking_customers"("company_id");

CREATE TABLE IF NOT EXISTS "booking_working_hours" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    CONSTRAINT "booking_working_hours_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_hours_company_staff_day"
  ON "booking_working_hours"("company_id", "staff_id", "weekday");

CREATE TABLE IF NOT EXISTS "booking_availability_blocks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    CONSTRAINT "booking_availability_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_blocks_company_start"
  ON "booking_availability_blocks"("company_id", "start_at");

CREATE TABLE IF NOT EXISTS "booking_appointments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingAppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingAppointmentSource" NOT NULL DEFAULT 'ADMIN',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "booking_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_appts_company_start" ON "booking_appointments"("company_id", "start_at");
CREATE INDEX IF NOT EXISTS "idx_booking_appts_staff_start" ON "booking_appointments"("staff_id", "start_at");
CREATE INDEX IF NOT EXISTS "idx_booking_appts_customer" ON "booking_appointments"("customer_id");

CREATE TABLE IF NOT EXISTS "booking_appointment_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_appointment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_booking_appt_events_appt" ON "booking_appointment_events"("appointment_id");

DO $$ BEGIN
  ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_staff" ADD CONSTRAINT "booking_staff_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_staff_services" ADD CONSTRAINT "booking_staff_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "booking_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_staff_services" ADD CONSTRAINT "booking_staff_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_customers" ADD CONSTRAINT "booking_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_working_hours" ADD CONSTRAINT "booking_working_hours_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_working_hours" ADD CONSTRAINT "booking_working_hours_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "booking_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_availability_blocks" ADD CONSTRAINT "booking_availability_blocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_availability_blocks" ADD CONSTRAINT "booking_availability_blocks_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "booking_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "booking_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "booking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "booking_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "booking_appointment_events" ADD CONSTRAINT "booking_appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "booking_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  ALTER TABLE "booking_appointments"
    ADD CONSTRAINT "booking_appointments_no_overlap"
    EXCLUDE USING gist (
      staff_id WITH =,
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status IN ('PENDING', 'CONFIRMED', 'COMPLETED'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
