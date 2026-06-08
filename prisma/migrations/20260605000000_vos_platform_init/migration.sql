-- vos.ai — Multi-tenant platform initialization (PostgreSQL 16+)
-- Run on a fresh database (Neon production branch).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT');
CREATE TYPE "AiMessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

CREATE TABLE "companies" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "tax_id"     TEXT,
  "address"    TEXT,
  "phone"      TEXT,
  "email"      TEXT,
  "status"     "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id"            TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "idx_users_active" ON "users" ("active");

CREATE TABLE "company_members" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "status"     "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "joined_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "company_members_company_user_key" ON "company_members" ("company_id", "user_id");
CREATE INDEX "idx_company_members_company_id" ON "company_members" ("company_id");
CREATE INDEX "idx_company_members_user_id" ON "company_members" ("user_id");
CREATE INDEX "idx_company_members_status" ON "company_members" ("status");

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE "roles" (
  "id"          TEXT NOT NULL,
  "company_id"  TEXT,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "is_system"   BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "roles_company_slug_key" ON "roles" ("company_id", "slug");
CREATE INDEX "idx_roles_company_id" ON "roles" ("company_id");

CREATE TABLE "permissions" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "module_slug" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions" ("slug");
CREATE INDEX "idx_permissions_module_slug" ON "permissions" ("module_slug");

CREATE TABLE "role_permissions" (
  "role_id"       TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "company_member_roles" (
  "company_member_id" TEXT NOT NULL,
  "role_id"           TEXT NOT NULL,
  CONSTRAINT "company_member_roles_pkey" PRIMARY KEY ("company_member_id", "role_id"),
  CONSTRAINT "company_member_roles_company_member_id_fkey" FOREIGN KEY ("company_member_id") REFERENCES "company_members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------

CREATE TABLE "modules" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modules_slug_key" ON "modules" ("slug");

CREATE TABLE "company_modules" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "module_id"  TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "enabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_modules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "company_modules_company_module_key" ON "company_modules" ("company_id", "module_id");
CREATE INDEX "idx_company_modules_company_id" ON "company_modules" ("company_id");
CREATE INDEX "idx_company_modules_is_enabled" ON "company_modules" ("is_enabled");

-- ---------------------------------------------------------------------------
-- Products module
-- ---------------------------------------------------------------------------

CREATE TABLE "product_categories" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "parent_id"  TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_categories_company_slug_key" ON "product_categories" ("company_id", "slug");
CREATE INDEX "idx_product_categories_company_id" ON "product_categories" ("company_id");
CREATE INDEX "idx_product_categories_parent_id" ON "product_categories" ("parent_id");

CREATE TABLE "products" (
  "id"                TEXT NOT NULL,
  "company_id"        TEXT NOT NULL,
  "category_id"       TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "description"       TEXT NOT NULL DEFAULT '',
  "sku"               TEXT,
  "internal_code"     TEXT,
  "sale_price"        DECIMAL(14,2) NOT NULL,
  "cost"              DECIMAL(14,2) NOT NULL DEFAULT 0,
  "margin_percent"    DECIMAL(8,4) GENERATED ALWAYS AS (
    CASE
      WHEN "sale_price" > 0 THEN ROUND((("sale_price" - "cost") / "sale_price") * 100, 4)
      ELSE NULL
    END
  ) STORED,
  "status"            "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "primary_image_url" TEXT,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "products_sale_price_nonneg" CHECK ("sale_price" >= 0),
  CONSTRAINT "products_cost_nonneg" CHECK ("cost" >= 0)
);

CREATE UNIQUE INDEX "products_company_sku_key" ON "products" ("company_id", "sku") WHERE "sku" IS NOT NULL;
CREATE UNIQUE INDEX "products_company_internal_code_key" ON "products" ("company_id", "internal_code") WHERE "internal_code" IS NOT NULL;
CREATE INDEX "idx_products_company_id" ON "products" ("company_id");
CREATE INDEX "idx_products_category_id" ON "products" ("category_id");
CREATE INDEX "idx_products_status" ON "products" ("status");
CREATE INDEX "idx_products_company_status" ON "products" ("company_id", "status");

CREATE TABLE "product_images" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "url"        TEXT NOT NULL,
  "alt_text"   TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_images_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_product_images_company_id" ON "product_images" ("company_id");
CREATE INDEX "idx_product_images_product_id" ON "product_images" ("product_id");
CREATE INDEX "idx_product_images_product_primary" ON "product_images" ("product_id", "is_primary");

-- ---------------------------------------------------------------------------
-- AI (future-ready)
-- ---------------------------------------------------------------------------

CREATE TABLE "ai_agents" (
  "id"            TEXT NOT NULL,
  "company_id"    TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "system_prompt" TEXT,
  "model"         TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "config"        JSONB,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_agents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ai_agents_company_slug_key" ON "ai_agents" ("company_id", "slug");
CREATE INDEX "idx_ai_agents_company_id" ON "ai_agents" ("company_id");

CREATE TABLE "ai_conversations" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "agent_id"   TEXT,
  "user_id"    TEXT,
  "title"      TEXT,
  "metadata"   JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_ai_conversations_company_id" ON "ai_conversations" ("company_id");
CREATE INDEX "idx_ai_conversations_agent_id" ON "ai_conversations" ("agent_id");
CREATE INDEX "idx_ai_conversations_user_id" ON "ai_conversations" ("user_id");

CREATE TABLE "ai_messages" (
  "id"              TEXT NOT NULL,
  "company_id"      TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role"            "AiMessageRole" NOT NULL,
  "content"         TEXT NOT NULL,
  "token_count"     INTEGER,
  "metadata"        JSONB,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_ai_messages_company_id" ON "ai_messages" ("company_id");
CREATE INDEX "idx_ai_messages_conversation_id" ON "ai_messages" ("conversation_id");
CREATE INDEX "idx_ai_messages_created_at" ON "ai_messages" ("created_at");

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_logs" (
  "id"         TEXT NOT NULL,
  "company_id" TEXT,
  "user_id"    TEXT,
  "action"     "AuditAction" NOT NULL,
  "table_name" TEXT NOT NULL,
  "record_id"  TEXT,
  "old_values" JSONB,
  "new_values" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_audit_logs_company_id" ON "audit_logs" ("company_id");
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" ("user_id");
CREATE INDEX "idx_audit_logs_table_name" ON "audit_logs" ("table_name");
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" ("created_at");
CREATE INDEX "idx_audit_logs_company_created" ON "audit_logs" ("company_id", "created_at");

-- ---------------------------------------------------------------------------
-- Company indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "idx_companies_status" ON "companies" ("status");
CREATE INDEX "idx_companies_name" ON "companies" ("name");

-- ---------------------------------------------------------------------------
-- Row Level Security (prepared, disabled until app sets session context)
-- ---------------------------------------------------------------------------

ALTER TABLE "company_members"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_modules"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_images"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_agents"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_conversations"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_messages"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"           ENABLE ROW LEVEL SECURITY;

-- Policies use current_setting('app.current_company_id', true). Enable when NestJS sets it per request.
-- Example (commented):
-- CREATE POLICY tenant_isolation_products ON "products"
--   USING ("company_id" = current_setting('app.current_company_id', true));
