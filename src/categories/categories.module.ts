import { Module } from '@nestjs/common';
import { ProductCategoriesModule } from '../product-categories/product-categories.module';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [ProductCategoriesModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
