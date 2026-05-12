import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInventoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** FK a `categories` con `type = INVENTORY` */
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

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
  supplier?: string;

  @IsString()
  @IsOptional()
  lot?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number;

  /**
   * Código de producto para trazabilidad: reutilizar el mismo valor en cada compra/lote
   * del “mismo” insumo para contar cuántas veces se compró.
   */
  @IsString()
  @IsOptional()
  @MaxLength(64)
  traceProductCode?: string;
}
