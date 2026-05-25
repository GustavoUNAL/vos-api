import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecipesService } from './recipes.service';

@UseGuards(JwtAuthGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get('costs')
  costs() {
    return this.recipesService.listRecipeCosts();
  }

  @Get()
  catalog(@Query('categoryId') categoryId?: string) {
    return this.recipesService.listCatalog(categoryId);
  }
}
