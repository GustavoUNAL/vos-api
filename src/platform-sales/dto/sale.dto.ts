import { SaleSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleLineInputDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsNotEmpty()
  productName!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsString()
  @IsOptional()
  lineUnit?: string;

  @IsString()
  @IsOptional()
  lineSize?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  costAtSale?: number;

  @IsNumber()
  @IsOptional()
  profit?: number;
}

export class CreateSaleDto {
  @IsDateString()
  saleDate!: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsEnum(SaleSource)
  @IsOptional()
  source?: SaleSource;

  @IsString()
  @IsOptional()
  mesa?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineInputDto)
  lines!: SaleLineInputDto[];
}

export class UpdateSaleDto {
  @IsDateString()
  @IsOptional()
  saleDate?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsEnum(SaleSource)
  @IsOptional()
  source?: SaleSource;

  @IsString()
  @IsOptional()
  mesa?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReplaceSaleLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineInputDto)
  lines!: SaleLineInputDto[];
}
