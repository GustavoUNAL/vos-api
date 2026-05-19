import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ListPosOrdersQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(['open', 'closing', 'closed', 'paid'])
  status?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
}
