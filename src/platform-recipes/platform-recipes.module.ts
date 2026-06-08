import { Module } from '@nestjs/common';
import { PlatformRecipesController } from './platform-recipes.controller';
import { PlatformRecipesService } from './platform-recipes.service';

@Module({
  controllers: [PlatformRecipesController],
  providers: [PlatformRecipesService],
})
export class PlatformRecipesModule {}
