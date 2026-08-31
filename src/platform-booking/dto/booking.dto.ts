import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  BookingAppointmentSource,
  BookingAppointmentStatus,
} from '@prisma/client';

export class UpsertBookingServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin!: number;

  @Type(() => Number)
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertBookingStaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds?: string[];
}

export class UpsertBookingCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class WorkingHourDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  endMin!: number;

  @IsOptional()
  @IsString()
  staffId?: string | null;
}

export class ReplaceHoursDto {
  @IsOptional()
  @IsString()
  staffId?: string | null;

  @IsArray()
  hours!: WorkingHourDto[];
}

export class CreateBlockDto {
  @IsString()
  startAt!: string;

  @IsString()
  endAt!: string;

  @IsOptional()
  @IsString()
  staffId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CreateAppointmentDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  serviceId!: string;

  @IsString()
  staffId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(BookingAppointmentStatus)
  status?: BookingAppointmentStatus;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsEnum(BookingAppointmentStatus)
  status?: BookingAppointmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{3,48}$/)
  publicSlug?: string;

  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  noticeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsappPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(60)
  slotIntervalMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class PublicCreateAppointmentDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @IsString()
  @MinLength(7)
  @MaxLength(15)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class AvailabilityQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  serviceId!: string;

  @IsString()
  staffId!: string;
}

export { BookingAppointmentSource, BookingAppointmentStatus };
