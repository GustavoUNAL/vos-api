import {
  IsEnum,
  IsIn,
  IsOptional,
} from 'class-validator';
import { ShopPaymentMethod } from '@prisma/client';

export class UpdateShopOrderStatusDto {
  @IsIn(['PREPARING', 'DELIVERED'])
  status!: 'PREPARING' | 'DELIVERED';
}

export class CollectShopOrderPaymentDto {
  @IsEnum(ShopPaymentMethod)
  paymentMethod!: ShopPaymentMethod;
}

export class ListShopOrdersQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'PREPARING', 'DELIVERED', 'PAID', 'CANCELLED', 'EXPIRED'])
  status?: string;
}
