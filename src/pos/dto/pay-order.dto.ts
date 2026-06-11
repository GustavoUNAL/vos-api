import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const POS_PAYMENT_METHODS = [
  'cash',
  'card',
  'transfer',
  'nequi',
  'daviplata',
  'other',
] as const;

export type PosPaymentMethodApi = (typeof POS_PAYMENT_METHODS)[number];

export class PaymentSplitDto {
  @IsIn(POS_PAYMENT_METHODS)
  method!: PosPaymentMethodApi;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCOP!: number;
}

export class PayOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  splits!: PaymentSplitDto[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  tipCOP?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  discountCOP?: number;

  @IsString()
  @IsOptional()
  discountReason?: string;

  @IsBoolean()
  @IsOptional()
  printReceipt?: boolean;
}
