import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { ProductCostSourceDto } from './create-product.dto';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

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
