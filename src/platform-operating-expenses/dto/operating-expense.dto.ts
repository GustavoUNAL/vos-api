import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { OperatingExpenseKind } from '@prisma/client';

export class UpsertOperatingExpenseDto {
  @IsEnum(OperatingExpenseKind)
  kind!: OperatingExpenseKind;

  /** YYYY-MM or YYYY-MM-01 */
  @IsString()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/)
  expenseMonth!: string;

  @IsNumber()
  @Min(0)
  amountCOP!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpsertMonthUtilitiesDto {
  /** YYYY-MM */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  expenseMonth!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aguaCOP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  energiaCOP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  internetCOP?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
