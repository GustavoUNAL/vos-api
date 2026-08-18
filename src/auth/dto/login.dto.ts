import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** Empresa activa previa; solo se usa si el usuario sigue siendo miembro. */
  @IsOptional()
  @IsString()
  companyId?: string;
}

