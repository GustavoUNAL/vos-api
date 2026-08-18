import { IsBoolean } from 'class-validator';

export class SetUserActiveDto {
  @IsBoolean()
  active!: boolean;
}
