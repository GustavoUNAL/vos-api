/**
 * Auditoría integral: esquema Prisma, base de datos (SQL), migraciones y scripts de lotes.
 *
 *   npm run db:audit
 *   npm run audit:full   # generate + validate + build + db:audit (API + BD)
 *   npx ts-node --transpile-only scripts/database-audit.ts
 *
 * Requiere DATABASE_URL. Sale con código 1 si algo falla.
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const root = process.cwd();

function runStep(name: string, cmd: string, args: string[]): boolean {
  console.log(`\n── ${name} ──`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (r.error) {
    console.error(r.error);
    return false;
  }
  if (r.status !== 0) {
    console.error(`(falló con código ${r.status})`);
    return false;
  }
  return true;
}

function isConnectivityFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: string }).code === 'string'
      ? (err as { code: string }).code
      : '';
  return (
    code === 'P1001' ||
    code === 'P1017' ||
    code === 'P2010' ||
    /can't reach database server/i.test(msg) ||
    /connection.*closed/i.test(msg) ||
    /connection terminated/i.test(msg) ||
    /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/i.test(msg) ||
    /ConnectionClosed/i.test(msg)
  );
}

function printConnectionTroubleshooting(hint?: string): void {
  console.error(`
No hay conexión estable con PostgreSQL${hint ? `. ${hint}` : ''}.

Revisa (sobre todo si usas Railway):
• Que el servicio Postgres esté **en ejecución** (planes gratuitos a veces duermen el servicio hasta que lo despiertas desde el dashboard).
• Que DATABASE_URL sea la de **red pública** del panel (desde tu Mac no sirve una URL solo para red privada de Railway).
• Vuelve a copiar host, puerto, usuario y contraseña del dashboard por si rotaron.
• Prueba solo TCP:  npm run db:tcp-check
• Si el servidor corta tras negociar TLS, prueba añadir a la URL:  ?sslmode=require  (o lo que indique la doc de tu proveedor).

El aviso de Node sobre sslmode y “verify-full” viene del driver \`pg\`; puedes fijar explícitamente sslmode en DATABASE_URL cuando te funcione la conexión.
`);
}

async function main() {
  console.log('Auditoría de base de datos — vos-api\n');

  if (!runStep('Validación de esquema (prisma validate)', 'npx', ['prisma', 'validate'])) {
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definida.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 25_000,
    max: 5,
  });

  try {
    await pool.query('select 1 as probe');
  } catch (e) {
    await pool.end().catch(() => {});
    console.error(
      e instanceof Error ? e.message : e,
      '\n── Fallo en prueba de conexión (SELECT 1) ──',
    );
    printConnectionTroubleshooting();
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let ok = true;

  try {
    console.log('\n── Integridad SQL (conteos problemáticos; 0 = bien) ──');

    type N = { c: bigint | number };
    const [
      salesWithoutLines,
      saleTotalMismatch,
      negativeInventory,
      recipeUsesDeletedInventory,
      q1,
      q2,
      q3,
      q5,
      activeProductsMissingCategory,
      activeInventoryMissingCategory,
      expensesMissingCategory,
      lotLineVsInventoryLotMismatch,
      purchaseLotItemCountMismatch,
      duplicateActiveInternalBarcodes,
      purchaseLotLinesInvalidCategory,
      saleLinesArchivedProduct,
      cartItemsArchivedProduct,
    ] = await Promise.all([
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from sales s
        where not exists (
          select 1 from sale_lines sl where sl.sale_id = s.id
        )
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from (
          select s.id
          from sales s
          join sale_lines sl on sl.sale_id = s.id
          group by s.id, s.total
          having abs(cast(s.total as numeric) - sum(sl.quantity * sl.unit_price)) > 1
        ) t
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from inventory i
        where i.deleted_at is null
          and i.quantity < 0
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from recipe_ingredients ri
        join inventory i on i.id = ri.inventory_item_id
        where i.deleted_at is not null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from inventory
        where deleted_at is null
          and (lot is null or btrim(lot) = '')
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from inventory i
        left join purchase_lots pl on pl.code = i.lot
        where i.deleted_at is null
          and i.lot is not null
          and btrim(i.lot) <> ''
          and pl.code is null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from purchase_lots pl
        where exists (
          select 1
          from inventory i
          where i.deleted_at is null
            and i.lot = pl.code
        )
          and (pl.total_value is null or pl.total_value <= 0)
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from purchase_lot_lines l
        left join inventory i on i.id = l.inventory_item_id
        where l.inventory_item_id is not null
          and (i.id is null or i.deleted_at is not null)
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from products p
        left join categories c on c.id = p.category_id
        where p.deleted_at is null
          and c.id is null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from inventory i
        left join categories c on c.id = i.category_id
        where i.deleted_at is null
          and c.id is null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from expenses e
        left join categories c on c.id = e.category_id
        where c.id is null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from purchase_lot_lines l
        join inventory i on i.id = l.inventory_item_id and i.deleted_at is null
        where l.inventory_item_id is not null
          and (
            i.lot is null
            or btrim(i.lot) = ''
            or btrim(l.purchase_lot_code) is distinct from btrim(i.lot)
          )
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from purchase_lots pl
        where (
          select count(*)::int
          from inventory i
          where i.deleted_at is null
            and i.lot is not null
            and btrim(i.lot) <> ''
            and btrim(i.lot) = btrim(pl.code)
        ) is distinct from pl.item_count
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from (
          select 1
          from inventory
          where deleted_at is null
            and internal_barcode is not null
          group by internal_barcode
          having count(*) > 1
        ) dupes
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from purchase_lot_lines l
        left join categories c on c.id = l.category_id
        where l.category_id is not null
          and c.id is null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from sale_lines sl
        join products p on p.id = sl.product_id
        where sl.product_id is not null
          and p.deleted_at is not null
      `,
      prisma.$queryRaw<N[]>`
        select count(*)::bigint as c
        from cart_items ci
        join products p on p.id = ci.product_id
        where p.deleted_at is not null
      `,
    ]);

    const critical = {
      salesWithoutLines: Number(salesWithoutLines[0]?.c ?? 0),
      saleTotalVsLinesMismatchOver1COP: Number(saleTotalMismatch[0]?.c ?? 0),
      activeInventoryNegativeQuantity: Number(negativeInventory[0]?.c ?? 0),
      recipeIngredientsUsingArchivedInventory: Number(
        recipeUsesDeletedInventory[0]?.c ?? 0,
      ),
      activeInventoryLotMissingPurchaseLotRow: Number(q2[0]?.c ?? 0),
      activeReferencedLotsWithoutPositiveTotalValue: Number(q3[0]?.c ?? 0),
      purchaseLotLinesLinkedToMissingOrArchivedInventory: Number(q5[0]?.c ?? 0),
      activeProductsWithMissingCategoryRow: Number(
        activeProductsMissingCategory[0]?.c ?? 0,
      ),
      activeInventoryWithMissingCategoryRow: Number(
        activeInventoryMissingCategory[0]?.c ?? 0,
      ),
      expensesWithMissingCategoryRow: Number(expensesMissingCategory[0]?.c ?? 0),
      purchaseLotLinesInventoryLotCodeMismatch: Number(
        lotLineVsInventoryLotMismatch[0]?.c ?? 0,
      ),
      purchaseLotsItemCountVsActiveInventoryMismatch: Number(
        purchaseLotItemCountMismatch[0]?.c ?? 0,
      ),
      duplicateInternalBarcodesAmongActiveInventory: Number(
        duplicateActiveInternalBarcodes[0]?.c ?? 0,
      ),
      purchaseLotLinesWithInvalidCategoryId: Number(
        purchaseLotLinesInvalidCategory[0]?.c ?? 0,
      ),
    };

    const warnings = {
      /** `lot` puede ser null por diseño; solo aviso de calidad de datos. */
      activeInventoryWithoutLot: Number(q1[0]?.c ?? 0),
      saleLinesPointingToArchivedProduct: Number(saleLinesArchivedProduct[0]?.c ?? 0),
      cartItemsPointingToArchivedProduct: Number(cartItemsArchivedProduct[0]?.c ?? 0),
    };

    console.log(JSON.stringify({ critical, warnings }, null, 2));

    const criticalIssues = Object.values(critical).some((n) => n > 0);
    const warnIssues = Object.values(warnings).some((n) => n > 0);

    if (warnIssues) {
      console.warn(
        '\nAdvertencias (no fallan la auditoría): revisa `warnings` si quieres homogeneizar lotes.',
      );
    }

    if (criticalIssues) {
      ok = false;
      console.error(
        '\nHay problemas en `critical`. Corrige datos o ejecuta scripts de sincronización/backfill.',
      );
    } else {
      console.log(
        '\nIntegridad SQL (crítico): sin anomalías en estas comprobaciones.',
      );
    }
  } catch (e) {
    ok = false;
    if (isConnectivityFailure(e)) {
      console.error('── Error de conexión durante las consultas ──');
      printConnectionTroubleshooting();
    } else {
      console.error(e);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  ok =
    runStep('Estado de migraciones (prisma migrate status)', 'npx', [
      'prisma',
      'migrate',
      'status',
    ]) && ok;

  // Subprocesos abren su propia conexión.
  ok =
    runStep('Lotes: total_value vs suma de líneas de comprobante', 'npx', [
      'ts-node',
      '--transpile-only',
      'scripts/audit-purchase-lot-line-totals.ts',
    ]) && ok;

  ok =
    runStep('Inventario/lotes (resumen JSON)', 'npx', [
      'ts-node',
      '--transpile-only',
      'scripts/check-lot-consistency.ts',
    ]) && ok;

  console.log(
    ok
      ? '\n✓ Auditoría completada sin errores bloqueantes.'
      : '\n✗ Auditoría terminó con problemas; revisa la salida anterior.',
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
