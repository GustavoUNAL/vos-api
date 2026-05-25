import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ExplorerModule } from './explorer/explorer.module';
import { RecipesModule } from './recipes/recipes.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PurchaseLotsModule } from './purchase-lots/purchase-lots.module';
import { AuthModule } from './auth/auth.module';
import { AdminExpensesModule } from './admin-expenses/admin-expenses.module';
import { GastosModule } from './gastos/gastos.module';
import { NavigationModule } from './navigation/navigation.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { PosModule } from './pos/pos.module';
import { ClientsModule } from './clients/clients.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /** Default global: 60 req/min/IP. Endpoints sensibles aplican @Throttle más estricto. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    AdminExpensesModule,
    GastosModule,
    NavigationModule,
    StockMovementsModule,
    ProductsModule,
    RecipesModule,
    InventoryModule,
    SalesModule,
    PurchaseLotsModule,
    ExplorerModule,
    PosModule,
    ClientsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
