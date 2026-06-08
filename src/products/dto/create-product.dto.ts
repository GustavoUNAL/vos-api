import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export enum ProductCostSourceDto {
  MANUAL = 'MANUAL',
  RECIPE = 'RECIPE',
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  internalCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsEnum(ProductCostSourceDto)
  costSource?: ProductCostSourceDto;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
