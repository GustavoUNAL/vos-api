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

export class PurchaseLotLineInputDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string | null;

  @IsString()
  lineName!: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsNumber()
  @Min(0)
  quantityPurchased!: number;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  purchaseUnitCostCOP!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotalCOP?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  lineComment?: string | null;
}

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

  /** Foto del comprobante de compra (data URL base64). */
  @IsOptional()
  @IsString()
  receiptImageDataUrl?: string;
}

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

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  comment?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  totalValue?: number;

  /** Foto del comprobante de compra (data URL base64). */
  @IsOptional()
  @IsString()
  receiptImageDataUrl?: string;
}

export class ReplacePurchaseLotLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLotLineInputDto)
  lines!: PurchaseLotLineInputDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedTotalValueCOP?: number;
}
