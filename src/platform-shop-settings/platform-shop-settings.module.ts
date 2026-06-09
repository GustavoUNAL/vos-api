import { Module } from '@nestjs/common';
import { PlatformShopSettingsController } from './platform-shop-settings.controller';
import { PlatformShopSettingsService } from './platform-shop-settings.service';

@Module({
  controllers: [PlatformShopSettingsController],
  providers: [PlatformShopSettingsService],
})
export class PlatformShopSettingsModule {}
