-- Sesiones revocables, token opaco de pedidos y cupo del asistente público.

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "company_id" TEXT,
    "platform_view" BOOLEAN NOT NULL DEFAULT false,
    "support_mode" TEXT,
    "support_until" INTEGER,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "idx_auth_sessions_user_id" ON "auth_sessions"("user_id");
CREATE INDEX "idx_auth_sessions_company_id" ON "auth_sessions"("company_id");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shop_orders" ADD COLUMN "access_token_hash" TEXT;
ALTER TABLE "shop_orders" ADD COLUMN "provider_payment_status" TEXT;
CREATE UNIQUE INDEX "shop_orders_access_token_hash_key" ON "shop_orders"("access_token_hash");

CREATE TABLE "public_ai_usage_days" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "public_ai_usage_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_ai_usage_days_day_key" ON "public_ai_usage_days"("day");
