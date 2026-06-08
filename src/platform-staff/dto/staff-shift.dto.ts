import { StaffShiftStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStaffShiftDto {
  @IsString()
  staffMemberId!: string;

  @IsISO8601()
  startAt!: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsNumber()
  @Min(0)
  hourlyRateCOP!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursWorked?: number;

  @IsOptional()
  @IsEnum(StaffShiftStatus)
  status?: StaffShiftStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateStaffShiftDto {
  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRateCOP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursWorked?: number | null;

  @IsOptional()
  @IsEnum(StaffShiftStatus)
  status?: StaffShiftStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
