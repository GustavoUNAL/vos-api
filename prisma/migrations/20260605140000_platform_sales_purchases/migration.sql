-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('MANUAL', 'POS', 'IMPORT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "purchase_lot_id" TEXT;

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT,
    "sale_date" TIMESTAMPTZ(6) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "payment_method" TEXT,
    "source" "SaleSource" NOT NULL DEFAULT 'MANUAL',
    "user_id" TEXT,
    "mesa" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "line_unit" TEXT,
    "line_size" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "cost_at_sale" DECIMAL(14,2),
    "profit" DECIMAL(14,2),

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "purchase_date" TIMESTAMPTZ(6) NOT NULL,
    "supplier" TEXT,
    "notes" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lot_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "purchase_lot_id" TEXT NOT NULL,
    "inventory_item_id" TEXT,
    "category_id" TEXT,
    "line_name" TEXT NOT NULL,
    "quantity_purchased" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "purchase_unit_cost_cop" DECIMAL(14,2) NOT NULL,
    "line_total_cop" DECIMAL(14,2) NOT NULL,
    "line_comment" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_lot_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_company_code_key" ON "sales"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_sales_company_id" ON "sales"("company_id");

-- CreateIndex
CREATE INDEX "idx_sales_company_sale_date" ON "sales"("company_id", "sale_date");

-- CreateIndex
CREATE INDEX "idx_sales_sale_date" ON "sales"("sale_date");

-- CreateIndex
CREATE INDEX "idx_sale_lines_sale_id" ON "sale_lines"("sale_id");

-- CreateIndex
CREATE INDEX "idx_sale_lines_product_id" ON "sale_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lots_company_code_key" ON "purchase_lots"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_purchase_lots_company_id" ON "purchase_lots"("company_id");

-- CreateIndex
CREATE INDEX "idx_purchase_lots_company_purchase_date" ON "purchase_lots"("company_id", "purchase_date");

-- CreateIndex
CREATE INDEX "idx_purchase_lots_purchase_date" ON "purchase_lots"("purchase_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lot_lines_inventory_item_id_key" ON "purchase_lot_lines"("inventory_item_id");

-- CreateIndex
CREATE INDEX "idx_purchase_lot_lines_lot_id" ON "purchase_lot_lines"("purchase_lot_id");

-- CreateIndex
CREATE INDEX "idx_purchase_lot_lines_company_id" ON "purchase_lot_lines"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_items_purchase_lot_id" ON "inventory_items"("purchase_lot_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_purchase_lot_id_fkey" FOREIGN KEY ("purchase_lot_id") REFERENCES "purchase_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lot_lines" ADD CONSTRAINT "purchase_lot_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lot_lines" ADD CONSTRAINT "purchase_lot_lines_purchase_lot_id_fkey" FOREIGN KEY ("purchase_lot_id") REFERENCES "purchase_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lot_lines" ADD CONSTRAINT "purchase_lot_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lot_lines" ADD CONSTRAINT "purchase_lot_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
