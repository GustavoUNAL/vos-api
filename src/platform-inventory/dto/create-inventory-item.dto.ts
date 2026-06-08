import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { InventoryBehavior } from '@prisma/client';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsString()
  @IsOptional()
  lot?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number;

  @IsEnum(InventoryBehavior)
  @IsOptional()
  behavior?: InventoryBehavior;
}
