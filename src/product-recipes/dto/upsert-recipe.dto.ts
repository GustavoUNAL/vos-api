import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

enum RecipeCostKindDto {
  FIJO = 'FIJO',
  VARIABLE = 'VARIABLE',
}

class RecipeIngredientDto {
  @IsString()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

class RecipeCostLineDto {
  @IsEnum(RecipeCostKindDto)
  kind!: RecipeCostKindDto;

  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  lineTotalCOP!: number;

  @IsOptional()
  @IsString()
  sheetUnitCost?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpsertRecipeDto {
  @IsNumber()
  @Min(0.0001)
  recipeYield!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RecipeCostLineDto)
  costs?: RecipeCostLineDto[];
}

export class UpdateRecipeAdminDto {
  @IsNumber()
  @Min(0)
  adminRate!: number;
}
