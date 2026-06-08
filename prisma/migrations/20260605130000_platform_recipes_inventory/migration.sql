-- CreateEnum
CREATE TYPE "RecipeCostKind" AS ENUM ('FIJO', 'VARIABLE');

-- CreateEnum
CREATE TYPE "InventoryBehavior" AS ENUM ('CONSUMABLE', 'CAPITAL_ASSET');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'und',
    "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(14,4),
    "lot_label" TEXT,
    "behavior" "InventoryBehavior" NOT NULL DEFAULT 'CONSUMABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "yield" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "admin_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_costs" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "kind" "RecipeCostKind" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "unit" TEXT NOT NULL,
    "line_total_cop" DECIMAL(12,2) NOT NULL,
    "sheet_unit_cost" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipe_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_inventory_items_company_id" ON "inventory_items"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_items_category_id" ON "inventory_items"("category_id");

-- CreateIndex
CREATE INDEX "idx_inventory_items_company_active" ON "inventory_items"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_product_id_key" ON "recipes"("product_id");

-- CreateIndex
CREATE INDEX "idx_recipes_company_id" ON "recipes"("company_id");

-- CreateIndex
CREATE INDEX "idx_recipes_product_id" ON "recipes"("product_id");

-- CreateIndex
CREATE INDEX "idx_recipe_costs_recipe_id" ON "recipe_costs"("recipe_id");

-- CreateIndex
CREATE INDEX "idx_recipe_ingredients_recipe_id" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "idx_recipe_ingredients_inventory_item_id" ON "recipe_ingredients"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_costs" ADD CONSTRAINT "recipe_costs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
