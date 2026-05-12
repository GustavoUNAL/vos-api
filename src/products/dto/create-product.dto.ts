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

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  /** FK a `categories` con `type = product` */
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  /** Slug de sección de menú: bar | cafeteria | cocteles | comida | shots */
  @IsString()
  @IsNotEmpty()
  type!: string;

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

  /** ISO 8601. Trazabilidad: última modificación/revisión declarada (distinta de `updatedAt` automático). */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  traceModifiedAt?: string | null;
}
