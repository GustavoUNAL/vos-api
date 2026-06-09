import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt.types';
import { SwitchCompanyDto } from './dto/switch-company.dto';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard';

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

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 8 : 30,
    },
  })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(
      dto.name,
      dto.email,
      dto.password,
      dto.companyName,
    );
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 20 : 60,
    },
  })
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.idToken, dto.companyName);
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

  @Post('platform/enter-company')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  enterCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.auth.enterCompanyAsPlatformAdmin(user.sub, dto.companyId);
  }

  @Post('platform/home')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  platformHome(@CurrentUser() user: JwtPayload) {
    return this.auth.exitToPlatformAdmin(user.sub);
  }
}
