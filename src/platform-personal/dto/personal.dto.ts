import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum PersonalMoneyKindDto {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export class UpsertPersonalMoneyDto {
  @IsEnum(PersonalMoneyKindDto)
  kind!: PersonalMoneyKindDto;

  @IsNumber()
  @Min(0.01)
  amountCOP!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** YYYY-MM-DD */
  @IsDateString()
  occurredOn!: string;
}

export class UpsertPersonalCalendarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;
}
