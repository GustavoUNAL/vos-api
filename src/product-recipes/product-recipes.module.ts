import { Module } from '@nestjs/common';
import { ProductRecipeController } from './product-recipe.controller';
import { ProductRecipeService } from './product-recipe.service';

@Module({
  controllers: [ProductRecipeController],
  providers: [ProductRecipeService],
  exports: [ProductRecipeService],
})
export class ProductRecipesModule {}
