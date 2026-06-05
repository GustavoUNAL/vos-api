import { ProductStatus, type Product, type ProductCategory } from '@prisma/client';

export type ProductApiRow = {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  type: string;
  imageUrl: string | null;
  sku: string | null;
  internalCode: string | null;
  cost: string;
  marginPercent: string | null;
  active: boolean;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    type: string;
    slug: string;
    parentId: string | null;
  };
};

export function statusToActive(status: ProductStatus): boolean {
  return status === 'ACTIVE';
}

export function activeToStatus(active?: boolean): ProductStatus {
  if (active === false) return 'INACTIVE';
  if (active === true) return 'ACTIVE';
  return 'DRAFT';
}

export function mapProduct(
  p: Product & { category: ProductCategory },
): ProductApiRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.salePrice.toString(),
    categoryId: p.categoryId,
    type: p.category.slug,
    imageUrl: p.primaryImageUrl,
    sku: p.sku,
    internalCode: p.internalCode,
    cost: p.cost.toString(),
    marginPercent: p.marginPercent?.toString() ?? null,
    active: statusToActive(p.status),
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    category: {
      id: p.category.id,
      name: p.category.name,
      type: 'PRODUCT',
      slug: p.category.slug,
      parentId: p.category.parentId,
    },
  };
}
