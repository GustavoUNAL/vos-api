import { IsBoolean } from 'class-validator';

export class SetPlatformAdminDto {
  @IsBoolean()
  enabled!: boolean;
}
