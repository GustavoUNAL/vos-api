import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class EnterCompanyDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  /** Opcional: el panel ya no pide motivo para entrar a una empresa. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
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
