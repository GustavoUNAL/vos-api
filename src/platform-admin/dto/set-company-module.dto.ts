import { IsBoolean, IsString, MinLength } from 'class-validator';

export class SetCompanyModuleDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsBoolean()
  enabled!: boolean;
}
