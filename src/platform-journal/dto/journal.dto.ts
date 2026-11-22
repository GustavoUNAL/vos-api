import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertJournalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;
}
