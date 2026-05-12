import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdatePurchaseLotDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  notes?: string;

  /** Mismo valor que `notes` (comentario libre). Si envías ambos, gana `comment`. */
  @IsString()
  @IsOptional()
  @MaxLength(8000)
  comment?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  totalValue?: number;

  /** ISO 8601, o `null` para borrar. Trazabilidad (distinta de `updatedAt` automático). */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  traceModifiedAt?: string | null;
}
