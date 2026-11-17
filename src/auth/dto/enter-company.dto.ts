import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class EnterCompanyDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class ElevateSupportDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  minutes?: number;
}
