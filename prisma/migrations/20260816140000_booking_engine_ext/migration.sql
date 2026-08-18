-- Scheduling engine extensions: generic currency + API source.

DO $$ BEGIN
  ALTER TYPE "BookingAppointmentSource" ADD VALUE IF NOT EXISTS 'API';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "booking_services"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'COP';
