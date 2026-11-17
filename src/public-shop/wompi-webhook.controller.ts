import {
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  wompiSignatureIsValid,
  type WompiEventBody,
} from '../common/wompi-signature';
import { PublicShopService } from './public-shop.service';

@Controller('public/shop/wompi')
export class WompiWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly shop: PublicShopService,
  ) {}

  @Post('events')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async events(@Body() body: WompiEventBody) {
    const secret = this.config.get<string>('WOMPI_EVENTS_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_NOT_CONFIGURED',
        message:
          'La tienda toma pedidos. El cobro se confirma en caja hasta configurar el webhook firmado.',
      });
    }
    if (!wompiSignatureIsValid(body, secret)) {
      throw new UnauthorizedException('Firma de pago inválida');
    }
    const transaction = body.data?.transaction;
    if (body.event !== 'transaction.updated' || !transaction?.reference || !transaction.status) {
      return { ok: true, ignored: true };
    }
    const result = await this.shop.recordProviderPayment({
      reference: transaction.reference,
      status: transaction.status,
      transactionId: transaction.id,
    });
    return { ok: true, ...result };
  }
}
