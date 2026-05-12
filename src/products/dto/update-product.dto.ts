import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  categoryId?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  type?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  size?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  /** ISO 8601, o `null` para borrar. Trazabilidad (distinta de `updatedAt` automático). */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  traceModifiedAt?: string | null;
}
