/**
 * Empresa Café Mi Nariño Bonito y catálogo de la tienda pública.
 * Uso: npm run db:create-narino-bonito
 *
 * No crea usuarios ni cambia contraseñas. Si existe el usuario de
 * SEED_GUSTAVO_EMAIL, o un administrador de plataforma, queda como propietario.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type ProductStatus } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const COMPANY_ID = 'seed-cafe-mi-narino-bonito';
const COMPANY_NAME = 'Café Mi Nariño Bonito';
const SHOP_SLUG = 'mi-narino-bonito';
const MODULES = [
  'products',
  'inventory',
  'sales',
  'purchases',
  'tasks',
  'finance',
] as const;

const COFFEE = [
  {
    id: 'narino-bourbon-rosado',
    sku: 'bourbon-rosado',
    name: 'Café Bourbon Rosado',
    stock: 28,
    image: '/images/bourbon-rosado.jpg',
    description:
      'Finca San Sebastián, vereda La Arboleda, Buesaco. 250 g tostados y molidos, sin aditivos ni conservantes.',
  },
  {
    id: 'narino-caturra',
    sku: 'caturra',
    name: 'Café Caturra',
    stock: 24,
    image: '/images/caturra-narino.jpg',
    description:
      'Caturra de Nariño, tostado y molido, en bolsa de 250 g.',
  },
  {
    id: 'narino-castillo',
    sku: 'castillo',
    name: 'Café Castillo',
    stock: 22,
    image: '/images/castillo-narino.jpg',
    description:
      'Castillo de Nariño, tostado y molido, en bolsa de 250 g.',
  },
  {
    id: 'narino-tipica',
    sku: 'tipica',
    name: 'Café Típica',
    stock: 20,
    image: '/images/tipica-narino.jpg',
    description:
      'Típica de Nariño, tostada y molida, en bolsa de 250 g.',
  },
] as const;

const SHIPPING = {
  id: 'narino-envio',
  sku: 'envio',
  name: 'Envío',
  price: 12900,
  description: 'Envío nacional de la tienda. No se muestra en el catálogo público.',
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const slugOwner = await prisma.company.findFirst({
      where: { shopSlug: SHOP_SLUG, NOT: { id: COMPANY_ID } },
      select: { id: true, name: true },
    });
    if (slugOwner) {
      throw new Error(
        `El slug ${SHOP_SLUG} ya lo usa ${slugOwner.name} (${slugOwner.id}).`,
      );
    }

    const company = await prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: {
        id: COMPANY_ID,
        name: COMPANY_NAME,
        shopSlug: SHOP_SLUG,
        phone: '3129875623',
        address: 'Pasto, Calle 21 #22-33',
        status: 'ACTIVE',
        businessType: 'cafe',
      },
      update: {
        name: COMPANY_NAME,
        shopSlug: SHOP_SLUG,
        phone: '3129875623',
        address: 'Pasto, Calle 21 #22-33',
        status: 'ACTIVE',
        businessType: 'cafe',
      },
    });

    const modules = await prisma.module.findMany({
      where: { slug: { in: [...MODULES] } },
    });
    if (modules.length !== MODULES.length) {
      throw new Error(
        'Faltan módulos de cafetería. Ejecuta npm run db:seed-platform.',
      );
    }

    const catalog = await prisma.module.findMany();
    const wanted = new Set<string>(MODULES);
    for (const mod of catalog) {
      const enabled = wanted.has(mod.slug);
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: { companyId: company.id, moduleId: mod.id },
        },
        create: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: enabled,
        },
        update: { isEnabled: enabled },
      });
    }

    const ownerRole = await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: 'owner' } },
      create: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        description: 'Acceso total dentro de la empresa',
        isSystem: true,
      },
      update: {
        name: 'Propietario',
        description: 'Acceso total dentro de la empresa',
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { moduleSlug: { in: [...MODULES] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: permission.id },
      });
    }

    const ownerEmail = (process.env.SEED_GUSTAVO_EMAIL ?? '').trim().toLowerCase();
    const owner =
      (ownerEmail
        ? await prisma.user.findUnique({ where: { email: ownerEmail } })
        : null) ??
      (await prisma.user.findFirst({
        where: { isPlatformAdmin: true, active: true },
        orderBy: { createdAt: 'asc' },
      }));

    let ownerAttached: string | null = null;
    if (owner) {
      const membership = await prisma.companyMember.upsert({
        where: {
          companyId_userId: { companyId: company.id, userId: owner.id },
        },
        create: { companyId: company.id, userId: owner.id, status: 'ACTIVE' },
        update: { status: 'ACTIVE' },
      });
      await prisma.companyMemberRole.deleteMany({
        where: { companyMemberId: membership.id },
      });
      await prisma.companyMemberRole.create({
        data: { companyMemberId: membership.id, roleId: ownerRole.id },
      });
      ownerAttached = owner.email;
    }

    const cafeCategory = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'cafe' },
      },
      create: {
        companyId: company.id,
        name: 'Café',
        slug: 'cafe',
        sortOrder: 1,
        active: true,
      },
      update: { name: 'Café', active: true, sortOrder: 1 },
    });

    const stockCategory = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'insumos' },
      },
      create: {
        companyId: company.id,
        name: 'Café empacado',
        slug: 'insumos',
        sortOrder: 2,
        active: true,
      },
      update: { name: 'Café empacado', active: true },
    });

    const hiddenCategory = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'inventario-envios' },
      },
      create: {
        companyId: company.id,
        name: 'INVENTORY::envios',
        slug: 'inventario-envios',
        sortOrder: 90,
        active: true,
      },
      update: { name: 'INVENTORY::envios', active: true },
    });

    const active: ProductStatus = 'ACTIVE';
    for (const item of COFFEE) {
      await prisma.product.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          companyId: company.id,
          categoryId: cafeCategory.id,
          name: item.name,
          description: item.description,
          sku: item.sku,
          internalCode: item.sku,
          salePrice: 35000,
          cost: 0,
          status: active,
          primaryImageUrl: item.image,
        },
        update: {
          companyId: company.id,
          categoryId: cafeCategory.id,
          name: item.name,
          description: item.description,
          sku: item.sku,
          internalCode: item.sku,
          salePrice: 35000,
          status: active,
          primaryImageUrl: item.image,
        },
      });
      await prisma.inventoryItem.upsert({
        where: { id: `stock-${item.id}` },
        create: {
          id: `stock-${item.id}`,
          companyId: company.id,
          categoryId: stockCategory.id,
          name: item.name,
          unit: 'bolsa',
          unitCost: 0,
          quantity: item.stock,
          minStock: 4,
          active: true,
        },
        update: {
          name: item.name,
          categoryId: stockCategory.id,
          quantity: item.stock,
          active: true,
        },
      });
    }

    await prisma.product.upsert({
      where: { id: SHIPPING.id },
      create: {
        id: SHIPPING.id,
        companyId: company.id,
        categoryId: hiddenCategory.id,
        name: SHIPPING.name,
        description: SHIPPING.description,
        sku: SHIPPING.sku,
        internalCode: SHIPPING.sku,
        salePrice: SHIPPING.price,
        cost: 0,
        status: active,
      },
      update: {
        categoryId: hiddenCategory.id,
        name: SHIPPING.name,
        description: SHIPPING.description,
        sku: SHIPPING.sku,
        salePrice: SHIPPING.price,
        status: active,
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          company: { id: company.id, name: company.name, shopSlug: SHOP_SLUG },
          publicPath: `/tienda/${SHOP_SLUG}`,
          owner: ownerAttached,
          products: COFFEE.map((item) => item.sku),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
