import { IsNotEmpty, IsString } from 'class-validator';

export class SwitchCompanyDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;
}
