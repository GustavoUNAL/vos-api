ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ(6);

UPDATE "users"
SET "is_platform_admin" = true
WHERE lower(email) IN ('admin@vos.ai', 'gustavoarteaga0508@gmail.com');
