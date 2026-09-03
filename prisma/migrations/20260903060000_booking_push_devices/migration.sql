CREATE TABLE IF NOT EXISTS "booking_push_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_push_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_push_devices_endpoint_key" ON "booking_push_devices"("endpoint");
CREATE INDEX IF NOT EXISTS "idx_booking_push_company" ON "booking_push_devices"("company_id");
CREATE INDEX IF NOT EXISTS "idx_booking_push_user" ON "booking_push_devices"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_push_devices_company_id_fkey'
  ) THEN
    ALTER TABLE "booking_push_devices"
      ADD CONSTRAINT "booking_push_devices_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_push_devices_user_id_fkey'
  ) THEN
    ALTER TABLE "booking_push_devices"
      ADD CONSTRAINT "booking_push_devices_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
