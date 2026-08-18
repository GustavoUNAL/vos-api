import { IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  idToken!: string;

  /** Solo en POST /auth/google (GIS). El flujo OAuth de la UI no auto-registra. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;
}
