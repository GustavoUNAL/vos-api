import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdatePosTableDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  number?: number;

  @IsString()
  @IsOptional()
  section?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number | null;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  guestCount?: number | null;
}
