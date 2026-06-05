import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';

const MODULES = [
  { slug: 'products', name: 'Productos', description: 'Catálogo y precios', sortOrder: 10 },
  { slug: 'inventory', name: 'Inventario', description: 'Stock y movimientos', sortOrder: 20 },
  { slug: 'sales', name: 'Ventas', description: 'POS y facturación', sortOrder: 30 },
  { slug: 'crm', name: 'CRM', description: 'Clientes y relaciones', sortOrder: 40 },
  { slug: 'projects', name: 'Proyectos', description: 'Gestión de proyectos', sortOrder: 50 },
  { slug: 'finance', name: 'Finanzas', description: 'Contabilidad y reportes', sortOrder: 60 },
] as const;

const PRODUCT_PERMISSIONS = [
  { slug: 'products.view', name: 'Ver productos' },
  { slug: 'products.create', name: 'Crear productos' },
  { slug: 'products.update', name: 'Editar productos' },
  { slug: 'products.delete', name: 'Eliminar productos' },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const adminPassword = 'Arandano2026!';
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const company = await prisma.company.upsert({
      where: { id: 'seed-arandano-cafe-bar' },
      create: {
        id: 'seed-arandano-cafe-bar',
        name: 'Arándano Café Bar',
        status: 'ACTIVE',
      },
      update: { name: 'Arándano Café Bar', status: 'ACTIVE' },
    });

    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@arandano.com' },
      create: {
        email: 'admin@arandano.com',
        passwordHash,
        name: 'Admin Arándano',
        active: true,
      },
      update: { passwordHash, name: 'Admin Arándano', active: true },
    });

    const membership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: adminUser.id,
        },
      },
      create: {
        companyId: company.id,
        userId: adminUser.id,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    const ownerRole = await prisma.role.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'owner' },
      },
      create: {
        companyId: company.id,
        slug: 'owner',
        name: 'Propietario',
        description: 'Acceso total dentro de la empresa',
        isSystem: true,
      },
      update: {},
    });

    for (const mod of MODULES) {
      await prisma.module.upsert({
        where: { slug: mod.slug },
        create: mod,
        update: { name: mod.name, description: mod.description, sortOrder: mod.sortOrder },
      });
    }

    const productsModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'products' },
    });

    await prisma.companyModule.upsert({
      where: {
        companyId_moduleId: {
          companyId: company.id,
          moduleId: productsModule.id,
        },
      },
      create: {
        companyId: company.id,
        moduleId: productsModule.id,
        isEnabled: true,
      },
      update: { isEnabled: true },
    });

    for (const perm of PRODUCT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { slug: perm.slug },
        create: {
          slug: perm.slug,
          moduleSlug: 'products',
          name: perm.name,
        },
        update: { name: perm.name },
      });
    }

    const permissions = await prisma.permission.findMany({
      where: { moduleSlug: 'products' },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ownerRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }

    await prisma.companyMemberRole.upsert({
      where: {
        companyMemberId_roleId: {
          companyMemberId: membership.id,
          roleId: ownerRole.id,
        },
      },
      create: {
        companyMemberId: membership.id,
        roleId: ownerRole.id,
      },
      update: {},
    });

    const menuCategories = [
      { name: 'Cafetería', slug: 'cafeteria' },
      { name: 'Comida rápida', slug: 'comida-rapida' },
      { name: 'Cervezas', slug: 'cervezas' },
      { name: 'Cócteles', slug: 'cocteles' },
      { name: 'Shots', slug: 'shots' },
      { name: 'Licores', slug: 'licores' },
    ] as const;

    const categoryIds: Record<string, string> = {};
    for (const [i, cat] of menuCategories.entries()) {
      const row = await prisma.productCategory.upsert({
        where: {
          companyId_slug: { companyId: company.id, slug: cat.slug },
        },
        create: {
          companyId: company.id,
          name: cat.name,
          slug: cat.slug,
          sortOrder: i,
        },
        update: { name: cat.name, sortOrder: i, active: true },
      });
      categoryIds[cat.slug] = row.id;
    }

    await prisma.productCategory.updateMany({
      where: {
        companyId: company.id,
        slug: { notIn: menuCategories.map((c) => c.slug) },
      },
      data: { active: false },
    });

    type MenuProduct = {
      name: string;
      description: string;
      categorySlug: (typeof menuCategories)[number]['slug'];
      price: number;
      sku: string;
    };

    const menuProducts: MenuProduct[] = [
      // Cafetería
      {
        name: 'Café negro artesanal',
        description:
          '140 ml de café nariñense preparado al momento de servir.',
        categorySlug: 'cafeteria',
        price: 4500,
        sku: 'CAF-001',
      },
      {
        name: 'Café con leche',
        description: '140 ml de café nariñense con leche.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: 'CAF-002',
      },
      {
        name: 'Vaso de leche',
        description: '140 ml de leche de vaca tibia o fría.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: 'CAF-003',
      },
      {
        name: 'Café aromatizado',
        description: '140 ml de café nariñense con canela o vainilla.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: 'CAF-004',
      },
      {
        name: 'Carajillo',
        description: '140 ml de café con 2 oz de aguardiente.',
        categorySlug: 'cafeteria',
        price: 15000,
        sku: 'CAF-005',
      },
      {
        name: 'Café irlandés',
        description:
          '120 ml de café nariñense con leche espumosa y 2 oz de whisky.',
        categorySlug: 'cafeteria',
        price: 20000,
        sku: 'CAF-006',
      },
      {
        name: 'Café frappé',
        description: '222 ml de café frío granizado con leche.',
        categorySlug: 'cafeteria',
        price: 10000,
        sku: 'CAF-007',
      },
      {
        name: 'Affogato',
        description: '140 ml de espresso con helado de vainilla.',
        categorySlug: 'cafeteria',
        price: 13000,
        sku: 'CAF-008',
      },
      {
        name: 'Leche achocolatada',
        description: '140 ml de leche con chocolate en polvo.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: 'CAF-009',
      },
      {
        name: 'Aromática con fruta',
        description:
          '140 ml de agua aromática con limón o frutos amarillos.',
        categorySlug: 'cafeteria',
        price: 6000,
        sku: 'CAF-010',
      },
      {
        name: 'Jarra de aromática con fruta',
        description:
          '407 ml de agua aromática con limón o frutos amarillos.',
        categorySlug: 'cafeteria',
        price: 13000,
        sku: 'CAF-011',
      },
      {
        name: 'Soda',
        description: '330 ml de soda Bretaña.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: 'CAF-012',
      },
      {
        name: 'Soda italiana',
        description: 'Soda con sirope, limón y opcional sal o picante.',
        categorySlug: 'cafeteria',
        price: 8000,
        sku: 'CAF-013',
      },
      {
        name: 'Coca Cola',
        description: '250 ml de gaseosa clásica servida fría.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: 'CAF-014',
      },
      {
        name: 'Limonada de la casa',
        description: 'Limonada artesanal preparada con limón fresco.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: 'CAF-015',
      },
      {
        name: 'Jugo natural',
        description: 'Jugo de fruta natural preparado al momento.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: 'CAF-016',
      },
      // Comida rápida
      {
        name: 'Hot dog pequeño',
        description:
          'Pan pequeño con salchicha, queso, salsas y cebolla curtida.',
        categorySlug: 'comida-rapida',
        price: 7000,
        sku: 'COM-001',
      },
      {
        name: 'Hot dog grande',
        description:
          'Pan grande con salchicha, jamón, queso, salsas y cebolla curtida.',
        categorySlug: 'comida-rapida',
        price: 14000,
        sku: 'COM-002',
      },
      {
        name: 'Sándwich pastuso',
        description: 'Pan fresco acompañado de queso crema, jamón y queso.',
        categorySlug: 'comida-rapida',
        price: 6000,
        sku: 'COM-003',
      },
      {
        name: 'Tostadas',
        description: 'Tostadas con queso crema y mermelada.',
        categorySlug: 'comida-rapida',
        price: 3000,
        sku: 'COM-004',
      },
      // Cervezas
      {
        name: 'Cerveza Poker',
        description: 'Cerveza nacional 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: 'CER-001',
      },
      {
        name: 'Cerveza Águila',
        description: 'Cerveza nacional 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: 'CER-002',
      },
      {
        name: 'Cerveza Budweiser',
        description: 'Cerveza rubia 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: 'CER-003',
      },
      {
        name: 'Cerveza Club Colombia',
        description: 'Cerveza nacional rubia o roja 269 ml.',
        categorySlug: 'cervezas',
        price: 6000,
        sku: 'CER-004',
      },
      {
        name: 'Cerveza Coronita',
        description: 'Cerveza importada rubia 210 ml.',
        categorySlug: 'cervezas',
        price: 6000,
        sku: 'CER-005',
      },
      {
        name: 'Vaso michelado',
        description: 'Limón, sal o picante para la cerveza.',
        categorySlug: 'cervezas',
        price: 3000,
        sku: 'CER-006',
      },
      {
        name: 'Jarra de cerveza',
        description: '1.5 litros de cerveza nacional.',
        categorySlug: 'cervezas',
        price: 25000,
        sku: 'CER-007',
      },
      // Cócteles
      {
        name: 'Hervido',
        description: 'Cóctel de frutas cítricas con 2 oz de licor artesanal.',
        categorySlug: 'cocteles',
        price: 7000,
        sku: 'COC-001',
      },
      {
        name: 'Cóctel Arándano',
        description: 'Granizado de arándano con 2 oz de ginebra.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: 'COC-002',
      },
      {
        name: 'Margarita',
        description: '2 oz de tequila, limón y triple sec.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: 'COC-003',
      },
      {
        name: 'Piña Colada',
        description: 'Piña colada con 2 oz de ron en hielo frappé.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: 'COC-004',
      },
      {
        name: 'Negroni',
        description: 'Campari, ginebra y jugo de naranja.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: 'COC-005',
      },
      {
        name: 'Moscow Mule',
        description: 'Cerveza, limón, triple sec y vodka.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: 'COC-006',
      },
      {
        name: 'Gin & Tonic',
        description:
          'Agua tónica con 2 oz de ginebra y rodaja de limón o pepino.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: 'COC-007',
      },
      {
        name: 'Whisky en las rocas',
        description: '2 oz de whisky con hielo.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: 'COC-008',
      },
      {
        name: 'Coco Loco',
        description: 'Crema de coco, ron blanco y hielo frappé.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: 'COC-009',
      },
      {
        name: 'Gin Tonic Campari',
        description: 'Ginebra, Campari y agua tónica fría.',
        categorySlug: 'cocteles',
        price: 25000,
        sku: 'COC-010',
      },
      {
        name: 'Mojito',
        description: 'Ron blanco, hierbabuena, limón, azúcar y soda.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: 'COC-011',
      },
      // Shots
      {
        name: 'Shot vodka',
        description: '1 oz de vodka con limón y sal.',
        categorySlug: 'shots',
        price: 7000,
        sku: 'SHO-001',
      },
      {
        name: 'Shot aguardiente',
        description: '1 oz de aguardiente con limón y sal.',
        categorySlug: 'shots',
        price: 6000,
        sku: 'SHO-002',
      },
      {
        name: 'Shot ginebra',
        description: '1 oz de ginebra con aceituna y limón.',
        categorySlug: 'shots',
        price: 10000,
        sku: 'SHO-003',
      },
      {
        name: 'Shot tequila',
        description: '1 oz de tequila con limón y sal.',
        categorySlug: 'shots',
        price: 10000,
        sku: 'SHO-004',
      },
      {
        name: 'Shot brandy',
        description: '1 oz de brandy con cereza.',
        categorySlug: 'shots',
        price: 6000,
        sku: 'SHO-005',
      },
      {
        name: 'Shot whisky',
        description: '1 oz de whisky solo o con limón.',
        categorySlug: 'shots',
        price: 12000,
        sku: 'SHO-006',
      },
      {
        name: 'Shot ron',
        description: '1 oz de ron con limón o cereza.',
        categorySlug: 'shots',
        price: 7000,
        sku: 'SHO-007',
      },
      {
        name: 'Copa de vino',
        description: '150 ml de vino tinto en copa.',
        categorySlug: 'shots',
        price: 10000,
        sku: 'SHO-008',
      },
      // Licores
      {
        name: 'Botella Aguardiente Nariño',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: 'LIC-001',
      },
      {
        name: 'Media Aguardiente Nariño',
        description: '375 ml.',
        categorySlug: 'licores',
        price: 40000,
        sku: 'LIC-002',
      },
      {
        name: 'Aguardiente Amarillo',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: 'LIC-003',
      },
      {
        name: 'Media Aguardiente Amarillo',
        description: '375 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: 'LIC-004',
      },
      {
        name: "Ginebra Gordon's",
        description: '750 ml.',
        categorySlug: 'licores',
        price: 115000,
        sku: 'LIC-005',
      },
      {
        name: 'Tequila Olmeca',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 120000,
        sku: 'LIC-006',
      },
      {
        name: 'Vodka Smirnoff Tamarindo',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: 'LIC-007',
      },
      {
        name: 'Whisky Old Parr',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 180000,
        sku: 'LIC-008',
      },
      {
        name: 'Ron Viejo de Caldas',
        description: '750 ml de ron añejado.',
        categorySlug: 'licores',
        price: 85000,
        sku: 'LIC-009',
      },
      {
        name: 'Brandy Domecq',
        description: '750 ml de brandy suave y aromático.',
        categorySlug: 'licores',
        price: 85000,
        sku: 'LIC-010',
      },
      {
        name: 'Media Brandy Domecq',
        description: '375 ml de brandy suave y aromático.',
        categorySlug: 'licores',
        price: 45000,
        sku: 'LIC-011',
      },
    ];

    const catalogSkus = menuProducts.map((p) => p.sku);

    for (const p of menuProducts) {
      const categoryId = categoryIds[p.categorySlug];
      if (!categoryId) continue;
      const existing = await prisma.product.findFirst({
        where: { companyId: company.id, sku: p.sku },
      });
      const data = {
        categoryId,
        name: p.name,
        description: p.description,
        salePrice: p.price,
        cost: 0,
        status: 'ACTIVE' as const,
      };
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.product.create({
          data: {
            companyId: company.id,
            sku: p.sku,
            ...data,
          },
        });
      }
    }

    await prisma.product.updateMany({
      where: {
        companyId: company.id,
        sku: { notIn: catalogSkus },
      },
      data: { status: 'INACTIVE' },
    });

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: adminUser.id,
        action: 'CREATE',
        tableName: 'companies',
        recordId: company.id,
        newValues: { name: company.name, status: company.status },
      },
    });

    console.log('Platform seed OK:', {
      companyId: company.id,
      companyName: company.name,
      adminEmail: adminUser.email,
      adminPassword,
      enabledModules: ['products'],
      categories: menuCategories.map((c) => c.slug),
      products: menuProducts.length,
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
