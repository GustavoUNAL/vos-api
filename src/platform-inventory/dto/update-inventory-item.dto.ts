import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { InventoryBehavior } from '@prisma/client';

export class UpdateInventoryItemDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  categoryId?: string | null;

  @IsNumber()
  @IsOptional()
  @Min(0)
  quantity?: number;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  unit?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsString()
  @IsOptional()
  lot?: string | null;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number | null;

  @IsEnum(InventoryBehavior)
  @IsOptional()
  behavior?: InventoryBehavior;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
