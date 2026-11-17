import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.types';
import { NavigationService } from './navigation.service';

@Controller('navigation')
export class NavigationController {
  constructor(private readonly nav: NavigationService) {}

  /** Metadatos públicos, sin mapa de endpoints ni tablas. */
  @Get('public')
  publicMenu() {
    return {
      version: 1,
      product: 'vos',
      message: 'Solicitá acceso para operar tu negocio.',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  menu(@CurrentUser() user: JwtPayload) {
    return this.nav.getMenu(user.companyId || undefined);
  }
}
