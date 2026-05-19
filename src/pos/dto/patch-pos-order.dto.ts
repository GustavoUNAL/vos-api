import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderLineInputDto } from './order-line-input.dto';

export class PatchPosOrderDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  lines?: OrderLineInputDto[];

  @IsString()
  @IsOptional()
  @IsIn(['open', 'closing', 'closed', 'paid'])
  status?: string;
}
