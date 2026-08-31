import {
  IsEnum,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ShopPaymentMethod } from '@prisma/client';

export class UpdateShopOrderStatusDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['PREPARING', 'DELIVERED', 'CANCELLED', 'PAID'], {
    message: 'El estado debe ser PREPARING, DELIVERED, CANCELLED o PAID',
  })
  status!: 'PREPARING' | 'DELIVERED' | 'CANCELLED' | 'PAID';
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
