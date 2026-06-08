import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ShopCheckoutDto } from './dto/shop-checkout.dto';
import { PublicShopService } from './public-shop.service';

@Controller('public/shop')
export class PublicShopController {
  constructor(private readonly shop: PublicShopService) {}

  @Get(':slug/catalog')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  catalog(@Param('slug') slug: string) {
    return this.shop.getCatalog(slug);
  }

  @Post(':slug/checkout')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkout(@Param('slug') slug: string, @Body() dto: ShopCheckoutDto) {
    return this.shop.checkout(slug, dto);
  }

  @Get(':slug/orders/:orderCode')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  orderByCode(
    @Param('slug') slug: string,
    @Param('orderCode') orderCode: string,
  ) {
    return this.shop.getOrderByCode(slug, orderCode);
  }

  @Get('orders/:orderId')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  order(@Param('orderId') orderId: string) {
    return this.shop.getOrder(orderId);
  }

  @Post('orders/:orderId/confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@Param('orderId') orderId: string) {
    return this.shop.confirmPayment(orderId);
  }
}
