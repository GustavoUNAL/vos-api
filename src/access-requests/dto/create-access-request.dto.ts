import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccessRequestDto {
  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @MinLength(2)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  message?: string;
}
