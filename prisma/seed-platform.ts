import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../src/common/pg-pool-config';
import { estimateProductionCostCOP } from '../src/common/estimate-product-cost';

const MODULES = [
  { slug: 'products', name: 'Productos', description: 'Catálogo y precios', sortOrder: 10 },
  { slug: 'inventory', name: 'Inventario', description: 'Stock y movimientos', sortOrder: 20 },
  { slug: 'sales', name: 'Ventas', description: 'POS y facturación', sortOrder: 30 },
  { slug: 'purchases', name: 'Compras', description: 'Lotes y proveedores', sortOrder: 35 },
  { slug: 'tasks', name: 'Tareas', description: 'Actividades diarias del equipo', sortOrder: 36 },
  { slug: 'staff', name: 'Personal', description: 'Turnos y nómina por hora', sortOrder: 38 },
  { slug: 'finance', name: 'Finanzas', description: 'Análisis y reportes', sortOrder: 42 },
  { slug: 'crm', name: 'CRM', description: 'Clientes y relaciones', sortOrder: 40 },
  { slug: 'projects', name: 'Proyectos', description: 'Gestión de proyectos', sortOrder: 50 },
] as const;

const PRODUCT_PERMISSIONS = [
  { slug: 'products.view', name: 'Ver productos' },
  { slug: 'products.create', name: 'Crear productos' },
  { slug: 'products.update', name: 'Editar productos' },
  { slug: 'products.delete', name: 'Eliminar productos' },
] as const;

const SALES_PERMISSIONS = [
  { slug: 'sales.view', name: 'Ver ventas' },
  { slug: 'sales.create', name: 'Registrar ventas' },
  { slug: 'sales.update', name: 'Editar ventas' },
  { slug: 'sales.delete', name: 'Eliminar ventas' },
] as const;

const TASKS_PERMISSIONS = [
  { slug: 'tasks.view', name: 'Ver tareas' },
  { slug: 'tasks.create', name: 'Crear tareas' },
  { slug: 'tasks.update', name: 'Editar tareas' },
  { slug: 'tasks.delete', name: 'Eliminar tareas' },
] as const;

/** Operaciones diarias sin finanzas ni borrar ventas. */
const MANAGER_PERMISSION_SLUGS = [
  'products.view',
  'products.create',
  'products.update',
  'inventory.view',
  'inventory.create',
  'inventory.update',
  'sales.view',
  'sales.create',
  'sales.update',
  'purchases.view',
  'purchases.create',
  'purchases.update',
  'staff.view',
  'staff.create',
  'staff.update',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
] as const;

const INVENTORY_PERMISSIONS = [
  { slug: 'inventory.view', name: 'Ver inventario' },
  { slug: 'inventory.create', name: 'Crear ítems de inventario' },
  { slug: 'inventory.update', name: 'Editar inventario' },
  { slug: 'inventory.delete', name: 'Eliminar inventario' },
] as const;

const PURCHASES_PERMISSIONS = [
  { slug: 'purchases.view', name: 'Ver compras' },
  { slug: 'purchases.create', name: 'Registrar compras' },
  { slug: 'purchases.update', name: 'Editar compras' },
] as const;

const STAFF_PERMISSIONS = [
  { slug: 'staff.view', name: 'Ver personal' },
  { slug: 'staff.create', name: 'Registrar personal y turnos' },
  { slug: 'staff.update', name: 'Editar personal y turnos' },
  { slug: 'staff.delete', name: 'Eliminar personal y turnos' },
] as const;

const FINANCE_PERMISSIONS = [
  { slug: 'finance.view', name: 'Ver análisis financiero' },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool(pgPoolConfig(url));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Credenciales plataforma (solo admin global)
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@vos.ai').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'VosAi2026!';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador VOS AI';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  // Credenciales tenant Arándano Café Bar
  const arandanoEmail = (process.env.SEED_ARANDANO_EMAIL ?? 'owner@arandano.com').trim().toLowerCase();
  const arandanoPassword = process.env.SEED_ARANDANO_PASSWORD ?? 'Arandano2026!';
  const arandanoName = process.env.SEED_ARANDANO_NAME ?? 'Propietario Arándano';
  const arandanoPasswordHash = await bcrypt.hash(arandanoPassword, 10);

  const davidEmail = (process.env.SEED_DAVID_EMAIL ?? 'david@arandano.com')
    .trim()
    .toLowerCase();
  const davidPassword = process.env.SEED_DAVID_PASSWORD ?? 'David@Arandano2026!';
  const davidName = process.env.SEED_DAVID_NAME ?? 'David Herrera';
  const davidPasswordHash = await bcrypt.hash(davidPassword, 10);

  try {
    const company = await prisma.company.upsert({
      where: { id: 'seed-arandano-cafe-bar' },
      create: {
        id: 'seed-arandano-cafe-bar',
        name: 'Arándano Café Bar',
        shopSlug: 'arandano',
        address: 'Carrera 35 #17-86',
        email: 'arandanocafebar@gmail.com',
        phone: '3332356632',
        status: 'ACTIVE',
      },
      update: {
        name: 'Arándano Café Bar',
        shopSlug: 'arandano',
        address: 'Carrera 35 #17-86',
        email: 'arandanocafebar@gmail.com',
        phone: '3332356632',
        status: 'ACTIVE',
      },
    });

    const legacyAdmin = await prisma.user.findUnique({
      where: { email: 'admin@arandano.com' },
    });
    if (legacyAdmin && legacyAdmin.email !== arandanoEmail) {
      await prisma.user.update({
        where: { id: legacyAdmin.id },
        data: {
          email: arandanoEmail,
          passwordHash: arandanoPasswordHash,
          name: arandanoName,
          active: true,
          isPlatformAdmin: false,
        },
      });
    }

    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        name: adminName,
        active: true,
        isPlatformAdmin: true,
      },
      update: {
        passwordHash: adminPasswordHash,
        name: adminName,
        active: true,
        isPlatformAdmin: true,
      },
    });

    const arandanoUser = await prisma.user.upsert({
      where: { email: arandanoEmail },
      create: {
        email: arandanoEmail,
        passwordHash: arandanoPasswordHash,
        name: arandanoName,
        active: true,
        isPlatformAdmin: false,
      },
      update: {
        passwordHash: arandanoPasswordHash,
        name: arandanoName,
        active: true,
        isPlatformAdmin: false,
      },
    });

    // Quitar al admin de plataforma de membresías de tenant (solo gestiona desde /platform)
    await prisma.companyMember.deleteMany({
      where: { userId: adminUser.id },
    });

    const membership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: arandanoUser.id,
        },
      },
      create: {
        companyId: company.id,
        userId: arandanoUser.id,
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
    const salesModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'sales' },
    });
    const inventoryModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'inventory' },
    });
    const purchasesModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'purchases' },
    });
    const staffModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'staff' },
    });
    const financeModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'finance' },
    });
    const tasksModule = await prisma.module.findUniqueOrThrow({
      where: { slug: 'tasks' },
    });

    for (const mod of [
      productsModule,
      inventoryModule,
      salesModule,
      purchasesModule,
      tasksModule,
      staffModule,
      financeModule,
    ]) {
      await prisma.companyModule.upsert({
        where: {
          companyId_moduleId: {
            companyId: company.id,
            moduleId: mod.id,
          },
        },
        create: {
          companyId: company.id,
          moduleId: mod.id,
          isEnabled: true,
        },
        update: { isEnabled: true },
      });
    }

    for (const perm of [
      ...PRODUCT_PERMISSIONS,
      ...INVENTORY_PERMISSIONS,
      ...SALES_PERMISSIONS,
      ...PURCHASES_PERMISSIONS,
      ...STAFF_PERMISSIONS,
      ...TASKS_PERMISSIONS,
      ...FINANCE_PERMISSIONS,
    ]) {
      await prisma.permission.upsert({
        where: { slug: perm.slug },
        create: {
          slug: perm.slug,
          moduleSlug: perm.slug.split('.')[0] ?? 'products',
          name: perm.name,
        },
        update: { name: perm.name },
      });
    }

    const permissions = await prisma.permission.findMany({
      where: {
        moduleSlug: {
          in: [
            'products',
            'inventory',
            'sales',
            'purchases',
            'tasks',
            'staff',
            'finance',
          ],
        },
      },
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

    const managerRole = await prisma.role.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'manager' },
      },
      create: {
        companyId: company.id,
        slug: 'manager',
        name: 'Operaciones',
        description: 'Operación diaria sin análisis financiero ni borrar ventas',
        isSystem: true,
      },
      update: {
        name: 'Operaciones',
        description: 'Operación diaria sin análisis financiero ni borrar ventas',
      },
    });

    const managerPerms = await prisma.permission.findMany({
      where: { slug: { in: [...MANAGER_PERMISSION_SLUGS] } },
    });
    for (const permission of managerPerms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: managerRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: managerRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }

    const davidUser = await prisma.user.upsert({
      where: { email: davidEmail },
      create: {
        email: davidEmail,
        passwordHash: davidPasswordHash,
        name: davidName,
        active: true,
        isPlatformAdmin: false,
      },
      update: {
        passwordHash: davidPasswordHash,
        name: davidName,
        active: true,
        isPlatformAdmin: false,
      },
    });

    const davidMembership = await prisma.companyMember.upsert({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: davidUser.id,
        },
      },
      create: {
        companyId: company.id,
        userId: davidUser.id,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    await prisma.companyMemberRole.deleteMany({
      where: { companyMemberId: davidMembership.id },
    });
    await prisma.companyMemberRole.create({
      data: {
        companyMemberId: davidMembership.id,
        roleId: managerRole.id,
      },
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
        sku: '1001',
      },
      {
        name: 'Café con leche',
        description: '140 ml de café nariñense con leche.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: '1002',
      },
      {
        name: 'Vaso de leche',
        description: '140 ml de leche de vaca tibia o fría.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: '1003',
      },
      {
        name: 'Café aromatizado',
        description: '140 ml de café nariñense con canela o vainilla.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: '1004',
      },
      {
        name: 'Carajillo',
        description: '140 ml de café con 2 oz de aguardiente.',
        categorySlug: 'cafeteria',
        price: 15000,
        sku: '1005',
      },
      {
        name: 'Café irlandés',
        description:
          '120 ml de café nariñense con leche espumosa y 2 oz de whisky.',
        categorySlug: 'cafeteria',
        price: 20000,
        sku: '1006',
      },
      {
        name: 'Café frappé',
        description: '222 ml de café frío granizado con leche.',
        categorySlug: 'cafeteria',
        price: 10000,
        sku: '1007',
      },
      {
        name: 'Affogato',
        description: '140 ml de espresso con helado de vainilla.',
        categorySlug: 'cafeteria',
        price: 13000,
        sku: '1008',
      },
      {
        name: 'Leche achocolatada',
        description: '140 ml de leche con chocolate en polvo.',
        categorySlug: 'cafeteria',
        price: 7000,
        sku: '1009',
      },
      {
        name: 'Aromática con fruta',
        description:
          '140 ml de agua aromática con limón o frutos amarillos.',
        categorySlug: 'cafeteria',
        price: 6000,
        sku: '1010',
      },
      {
        name: 'Jarra de aromática con fruta',
        description:
          '407 ml de agua aromática con limón o frutos amarillos.',
        categorySlug: 'cafeteria',
        price: 13000,
        sku: '1011',
      },
      {
        name: 'Soda',
        description: '330 ml de soda Bretaña.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: '1012',
      },
      {
        name: 'Soda italiana',
        description: 'Soda con sirope, limón y opcional sal o picante.',
        categorySlug: 'cafeteria',
        price: 8000,
        sku: '1013',
      },
      {
        name: 'Coca Cola',
        description: '250 ml de gaseosa clásica servida fría.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: '1014',
      },
      {
        name: 'Limonada de la casa',
        description: 'Limonada artesanal preparada con limón fresco.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: '1015',
      },
      {
        name: 'Jugo natural',
        description: 'Jugo de fruta natural preparado al momento.',
        categorySlug: 'cafeteria',
        price: 5000,
        sku: '1016',
      },
      // Comida rápida
      {
        name: 'Hot dog pequeño',
        description:
          'Pan pequeño con salchicha, queso, salsas y cebolla curtida.',
        categorySlug: 'comida-rapida',
        price: 7000,
        sku: '2001',
      },
      {
        name: 'Hot dog grande',
        description:
          'Pan grande con salchicha, jamón, queso, salsas y cebolla curtida.',
        categorySlug: 'comida-rapida',
        price: 14000,
        sku: '2002',
      },
      {
        name: 'Sándwich pastuso',
        description: 'Pan fresco acompañado de queso crema, jamón y queso.',
        categorySlug: 'comida-rapida',
        price: 6000,
        sku: '2003',
      },
      {
        name: 'Tostadas',
        description: 'Tostadas con queso crema y mermelada.',
        categorySlug: 'comida-rapida',
        price: 3000,
        sku: '2004',
      },
      {
        name: 'Hot Dog',
        description:
          'Pan suave con salchicha premium, queso, papa triturada, salsas y jalapeños.',
        categorySlug: 'comida-rapida',
        price: 11000,
        sku: '2005',
      },
      // Cervezas
      {
        name: 'Cerveza Poker',
        description: 'Cerveza nacional 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: '3001',
      },
      {
        name: 'Cerveza Águila',
        description: 'Cerveza nacional 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: '3002',
      },
      {
        name: 'Cerveza Budweiser',
        description: 'Cerveza rubia 330 ml.',
        categorySlug: 'cervezas',
        price: 5000,
        sku: '3003',
      },
      {
        name: 'Cerveza Club Colombia',
        description: 'Cerveza nacional rubia o roja 269 ml.',
        categorySlug: 'cervezas',
        price: 6000,
        sku: '3004',
      },
      {
        name: 'Cerveza Coronita',
        description: 'Cerveza importada rubia 210 ml.',
        categorySlug: 'cervezas',
        price: 6000,
        sku: '3005',
      },
      {
        name: 'Vaso michelado',
        description: 'Limón, sal o picante para la cerveza.',
        categorySlug: 'cervezas',
        price: 3000,
        sku: '3006',
      },
      {
        name: 'Jarra de cerveza',
        description: '1.5 litros de cerveza nacional.',
        categorySlug: 'cervezas',
        price: 25000,
        sku: '3007',
      },
      {
        name: 'Cerveza Michelada',
        description: 'Cerveza 330 ml con limón, sal o picante.',
        categorySlug: 'cervezas',
        price: 12000,
        sku: '3008',
      },
      // Cócteles
      {
        name: 'Hervido',
        description: 'Cóctel de frutas cítricas con 2 oz de licor artesanal.',
        categorySlug: 'cocteles',
        price: 7000,
        sku: '4001',
      },
      {
        name: 'Cóctel Arándano',
        description: 'Granizado de arándano con 2 oz de ginebra.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: '4002',
      },
      {
        name: 'Margarita',
        description: '2 oz de tequila, limón y triple sec.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: '4003',
      },
      {
        name: 'Piña Colada',
        description: 'Piña colada con 2 oz de ron en hielo frappé.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: '4004',
      },
      {
        name: 'Negroni',
        description: 'Campari, ginebra y jugo de naranja.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: '4005',
      },
      {
        name: 'Moscow Mule',
        description: 'Cerveza, limón, triple sec y vodka.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: '4006',
      },
      {
        name: 'Gin & Tonic',
        description:
          'Agua tónica con 2 oz de ginebra y rodaja de limón o pepino.',
        categorySlug: 'cocteles',
        price: 22000,
        sku: '4007',
      },
      {
        name: 'Whisky en las rocas',
        description: '2 oz de whisky con hielo.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: '4008',
      },
      {
        name: 'Coco Loco',
        description: 'Crema de coco, ron blanco y hielo frappé.',
        categorySlug: 'cocteles',
        price: 15000,
        sku: '4009',
      },
      {
        name: 'Gin Tonic Campari',
        description: 'Ginebra, Campari y agua tónica fría.',
        categorySlug: 'cocteles',
        price: 25000,
        sku: '4010',
      },
      {
        name: 'Mojito',
        description: 'Ron blanco, hierbabuena, limón, azúcar y soda.',
        categorySlug: 'cocteles',
        price: 20000,
        sku: '4011',
      },
      {
        name: 'Jarra de hervidos',
        description: 'Jarra 1 L de hervidos con fruta cítrica y licor artesanal.',
        categorySlug: 'cocteles',
        price: 35000,
        sku: '4012',
      },
      // Shots
      {
        name: 'Shot vodka',
        description: '1 oz de vodka con limón y sal.',
        categorySlug: 'shots',
        price: 7000,
        sku: '5001',
      },
      {
        name: 'Shot aguardiente',
        description: '1 oz de aguardiente con limón y sal.',
        categorySlug: 'shots',
        price: 6000,
        sku: '5002',
      },
      {
        name: 'Shot ginebra',
        description: '1 oz de ginebra con aceituna y limón.',
        categorySlug: 'shots',
        price: 10000,
        sku: '5003',
      },
      {
        name: 'Shot tequila',
        description: '1 oz de tequila con limón y sal.',
        categorySlug: 'shots',
        price: 10000,
        sku: '5004',
      },
      {
        name: 'Shot brandy',
        description: '1 oz de brandy con cereza.',
        categorySlug: 'shots',
        price: 6000,
        sku: '5005',
      },
      {
        name: 'Shot whisky',
        description: '1 oz de whisky solo o con limón.',
        categorySlug: 'shots',
        price: 12000,
        sku: '5006',
      },
      {
        name: 'Shot ron',
        description: '1 oz de ron con limón o cereza.',
        categorySlug: 'shots',
        price: 7000,
        sku: '5007',
      },
      {
        name: 'Copa de vino',
        description: '150 ml de vino tinto en copa.',
        categorySlug: 'shots',
        price: 10000,
        sku: '5008',
      },
      // Licores
      {
        name: 'Botella Aguardiente Nariño',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: '6001',
      },
      {
        name: 'Media Aguardiente Nariño',
        description: '375 ml.',
        categorySlug: 'licores',
        price: 40000,
        sku: '6002',
      },
      {
        name: 'Aguardiente Amarillo',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: '6003',
      },
      {
        name: 'Media Aguardiente Amarillo',
        description: '375 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: '6004',
      },
      {
        name: "Ginebra Gordon's",
        description: '750 ml.',
        categorySlug: 'licores',
        price: 115000,
        sku: '6005',
      },
      {
        name: 'Tequila Olmeca',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 120000,
        sku: '6006',
      },
      {
        name: 'Vodka Smirnoff Tamarindo',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 75000,
        sku: '6007',
      },
      {
        name: 'Whisky Old Parr',
        description: '750 ml.',
        categorySlug: 'licores',
        price: 180000,
        sku: '6008',
      },
      {
        name: 'Ron Viejo de Caldas',
        description: '750 ml de ron añejado.',
        categorySlug: 'licores',
        price: 85000,
        sku: '6009',
      },
      {
        name: 'Brandy Domecq',
        description: '750 ml de brandy suave y aromático.',
        categorySlug: 'licores',
        price: 85000,
        sku: '6010',
      },
      {
        name: 'Media Brandy Domecq',
        description: '375 ml de brandy suave y aromático.',
        categorySlug: 'licores',
        price: 45000,
        sku: '6011',
      },
    ];

    const catalogSkus = menuProducts.map((p) => p.sku);

    for (const p of menuProducts) {
      const categoryId = categoryIds[p.categorySlug];
      if (!categoryId) continue;
      const estimatedCost = estimateProductionCostCOP(p.price, p.categorySlug);
      const data = {
        categoryId,
        name: p.name,
        description: p.description,
        salePrice: p.price,
        cost: estimatedCost,
        costSource: 'MANUAL' as const,
        status: 'ACTIVE' as const,
        sku: p.sku,
      };

      const bySku = await prisma.product.findFirst({
        where: { companyId: company.id, sku: p.sku },
      });
      if (bySku) {
        await prisma.product.update({
          where: { id: bySku.id },
          data,
        });
        continue;
      }

      const byName = await prisma.product.findFirst({
        where: { companyId: company.id, name: p.name },
      });
      if (byName) {
        await prisma.product.update({
          where: { id: byName.id },
          data,
        });
      } else {
        await prisma.product.create({
          data: {
            companyId: company.id,
            ...data,
          },
        });
      }
    }

    await prisma.product.deleteMany({
      where: {
        companyId: company.id,
        sku: { notIn: catalogSkus },
      },
    });

    const insumosCategory = await prisma.productCategory.upsert({
      where: {
        companyId_slug: { companyId: company.id, slug: 'insumos' },
      },
      create: {
        companyId: company.id,
        name: 'INVENTORY::Insumos',
        slug: 'insumos',
        sortOrder: 100,
        active: true,
      },
      update: { name: 'INVENTORY::Insumos', active: true },
    });

    const demoInventory = [
      { name: 'Café molido', unit: 'g', unitCost: 81.5, quantity: 2000 },
      { name: 'Leche entera', unit: 'ml', unitCost: 500 / 60, quantity: 5000 },
      { name: 'Azúcar', unit: 'g', unitCost: 8, quantity: 3000 },
      { name: 'Vaso desechable', unit: 'und', unitCost: 350, quantity: 500 },
      { name: 'Aguardiente Nariño', unit: 'ml', unitCost: 75, quantity: 2000 },
      { name: 'Whisky para cóctel', unit: 'ml', unitCost: 80, quantity: 2000 },
      { name: 'Soda Bretaña', unit: 'ml', unitCost: 5, quantity: 5000 },
      { name: 'Sirope', unit: 'ml', unitCost: 50, quantity: 1000 },
    ] as const;

    for (const item of demoInventory) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { companyId: company.id, name: item.name },
      });
      if (existing) {
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: {
            unit: item.unit,
            unitCost: item.unitCost,
            quantity: item.quantity,
            active: true,
            categoryId: insumosCategory?.id ?? null,
          },
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            companyId: company.id,
            name: item.name,
            unit: item.unit,
            unitCost: item.unitCost,
            quantity: item.quantity,
            categoryId: insumosCategory?.id ?? null,
            active: true,
          },
        });
      }
    }

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

    const enabledModuleRows = await prisma.companyModule.findMany({
      where: { companyId: company.id, isEnabled: true },
      include: { module: { select: { slug: true } } },
      orderBy: { module: { sortOrder: 'asc' } },
    });

    console.log('Platform seed OK:', {
      companyId: company.id,
      companyName: company.name,
      platformAdminEmail: adminUser.email,
      platformAdminPassword: adminPassword,
      arandanoOwnerEmail: arandanoUser.email,
      arandanoOwnerPassword: arandanoPassword,
      davidEmail: davidUser.email,
      davidPassword,
      davidRole: managerRole.slug,
      enabledModules: enabledModuleRows.map((r) => r.module.slug),
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
