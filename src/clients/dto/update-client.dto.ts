import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
