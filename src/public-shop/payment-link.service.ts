import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentMethod } from '@prisma/client';

export type PaymentLinkResult = {
  paymentRef: string;
  paymentLink: string | null;
  paymentInstructions: string;
};

@Injectable()
export class PaymentLinkService {
  constructor(private readonly config: ConfigService) {}

  build(
    method: ShopPaymentMethod,
    args: {
      orderCode: string;
      totalCOP: number;
      customerPhone: string;
      shopFrontUrl?: string;
    },
  ): PaymentLinkResult {
    const ref = args.orderCode;
    const amount = Math.round(args.totalCOP);
    const formatted = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(amount);

    if (method === ShopPaymentMethod.NEQUI) {
      const nequiPhone = this.config
        .get<string>('SHOP_NEQUI_PHONE')
        ?.replace(/\D/g, '');
      const wompiLink = this.tryWompiLink(ref, amount, method);
      const instructions = nequiPhone
        ? [
            `Pedido ${ref} · Total ${formatted}`,
            `1. Abre Nequi en tu celular`,
            `2. Envía ${formatted} al Nequi ${nequiPhone}`,
            `3. En el mensaje escribe la referencia: ${ref}`,
            `4. Vuelve aquí y pulsa «Confirmar pago»`,
          ].join('\n')
        : [
            `Pedido ${ref} · Total ${formatted}`,
            `Configura SHOP_NEQUI_PHONE en el servidor con el Nequi del negocio.`,
            `Luego confirma el pago en esta pantalla.`,
          ].join('\n');

      const deepLink = nequiPhone
        ? `https://wa.me/57${nequiPhone}?text=${encodeURIComponent(
            `Hola, pago pedido ${ref} por ${formatted}`,
          )}`
        : null;

      return {
        paymentRef: ref,
        paymentLink: wompiLink ?? deepLink ?? args.shopFrontUrl ?? null,
        paymentInstructions: instructions,
      };
    }

    const brebKey =
      this.config.get<string>('SHOP_BREB_KEY')?.trim() ?? '@ARANDANOCAFE';
    const wompiLink = this.tryWompiLink(ref, amount, method);
    const instructions = [
      `Pedido ${ref} · Total ${formatted}`,
      `1. Abre la app de tu banco (Bre-B habilitado)`,
      `2. Transfiere ${formatted} a la llave Bre-B: ${brebKey}`,
      `3. Referencia: ${ref}`,
      `4. Vuelve aquí y pulsa «Confirmar pago»`,
    ].join('\n');

    return {
      paymentRef: ref,
      paymentLink: wompiLink ?? args.shopFrontUrl ?? null,
      paymentInstructions: instructions,
    };
  }

  private tryWompiLink(
    ref: string,
    amount: number,
    method: ShopPaymentMethod,
  ): string | null {
    const privateKey = this.config.get<string>('WOMPI_PRIVATE_KEY')?.trim();
    if (!privateKey) return null;
    const base = this.config.get<string>('WOMPI_API_BASE')?.trim()
      ?? 'https://production.wompi.co/v1';
    const redirect = this.config.get<string>('SHOP_PAYMENT_RETURN_URL')?.trim();
    return `${base}/payment_links?reference=${encodeURIComponent(ref)}&amount_in_cents=${amount * 100}&payment_method=${method === ShopPaymentMethod.NEQUI ? 'NEQUI' : 'BANCOLOMBIA_TRANSFER'}${
      redirect ? `&redirect_url=${encodeURIComponent(redirect)}` : ''
    }`;
  }
}
