import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt.types';
import { SwitchCompanyDto } from './dto/switch-company.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 15 : 60,
    },
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user);
  }

  @Post('switch-company')
  @UseGuards(JwtAuthGuard)
  switchCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.auth.switchCompany(user.sub, dto.companyId);
  }
}
