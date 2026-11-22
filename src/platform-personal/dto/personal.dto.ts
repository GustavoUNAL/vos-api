import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

export class UpsertPersonalIdeaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

export class UpsertWellnessDto {
  @IsInt()
  @Min(1)
  @Max(10)
  mood!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  health!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  love!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  friendships!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  family!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  checkedOn?: string;
}

export class UpsertMoneyBudgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  /** YYYY-MM */
  @IsString()
  month!: string;

  @IsNumber()
  @Min(0)
  limitCOP!: number;
}

export class AskAuraDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string;
}

/** @deprecated Usar AskAuraDto */
export class AskVicenteDto extends AskAuraDto {}

