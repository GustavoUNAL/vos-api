import { IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  idToken!: string;

  /** Solo al registrarse con Google (usuario nuevo). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;
}
