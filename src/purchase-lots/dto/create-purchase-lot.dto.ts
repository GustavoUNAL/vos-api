import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseLotLineInputDto } from './replace-purchase-lot-lines.dto';

export class CreatePurchaseLotDto {
  @IsDateString()
  purchaseDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLotLineInputDto)
  lines?: PurchaseLotLineInputDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;
}
