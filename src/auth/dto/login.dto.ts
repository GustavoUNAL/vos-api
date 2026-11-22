import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  /** Correo o usuario corto (p. ej. admin). */
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** Empresa activa previa; solo se usa si el usuario sigue siendo miembro. */
  @IsOptional()
  @IsString()
  companyId?: string;
}

