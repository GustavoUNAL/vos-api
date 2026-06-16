import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertCashCloseDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingFloatCOP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  countedCashCOP?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
