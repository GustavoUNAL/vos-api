import { readFileSync } from 'fs';
import { join } from 'path';

describe('módulos vigentes', () => {
  const root = join(__dirname, '..');
  const appModule = readFileSync(join(root, 'src/app.module.ts'), 'utf8');
  const build = readFileSync(join(root, 'tsconfig.build.json'), 'utf8');

  it('no importa la generación legacy de ventas, inventario ni compras', () => {
    for (const name of [
      'PosModule',
      'SalesModule',
      'InventoryModule',
      'RecipesModule',
      'PurchaseLotsModule',
      'GastosModule',
      'ExplorerModule',
      'ClientsModule',
    ]) {
      expect(appModule).not.toMatch(new RegExp(`import \\{ ${name} \\}`));
    }
    for (const folder of [
      'src/pos/**',
      'src/sales/**',
      'src/inventory/**',
      'src/purchase-lots/**',
      'src/gastos/**',
      'src/explorer/**',
      'src/clients/**',
    ]) {
      expect(build).toContain(folder);
    }
  });
});
