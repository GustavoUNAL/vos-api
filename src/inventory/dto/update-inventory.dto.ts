import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateInventoryDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  categoryId?: string;

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
  supplier?: string;

  @IsString()
  @IsOptional()
  lot?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number;

  /**
   * Código de producto para trazabilidad entre lotes. Enviar cadena vacía para borrar.
   */
  @IsString()
  @IsOptional()
  @MaxLength(64)
  traceProductCode?: string;
}
