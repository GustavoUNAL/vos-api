import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class InventoryQuantityNoteDto {
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
