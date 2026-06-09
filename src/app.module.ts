import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { NavigationModule } from './navigation/navigation.module';
import { TenantModule } from './tenant/tenant.module';
import { ProductCategoriesModule } from './product-categories/product-categories.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductRecipesModule } from './product-recipes/product-recipes.module';
import { PlatformInventoryModule } from './platform-inventory/platform-inventory.module';
import { PlatformRecipesModule } from './platform-recipes/platform-recipes.module';
import { PlatformSalesModule } from './platform-sales/platform-sales.module';
import { PlatformPurchasesModule } from './platform-purchases/platform-purchases.module';
import { PlatformStaffModule } from './platform-staff/platform-staff.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { PlatformCashCloseModule } from './platform-cash-close/platform-cash-close.module';
import { PlatformShopOrdersModule } from './platform-shop-orders/platform-shop-orders.module';
import { PlatformShopSettingsModule } from './platform-shop-settings/platform-shop-settings.module';
import { PublicShopModule } from './public-shop/public-shop.module';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV !== 'production',
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    NavigationModule,
    ProductCategoriesModule,
    CategoriesModule,
    ProductsModule,
    ProductRecipesModule,
    PlatformInventoryModule,
    PlatformRecipesModule,
    PlatformSalesModule,
    PlatformPurchasesModule,
    PlatformStaffModule,
    PlatformAnalyticsModule,
    PlatformCashCloseModule,
    PlatformShopOrdersModule,
    PlatformShopSettingsModule,
    PublicShopModule,
    AccessRequestsModule,
    PlatformAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
