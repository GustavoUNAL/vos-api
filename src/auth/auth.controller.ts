import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearRefreshCookie, readCookie, REFRESH_COOKIE, setRefreshCookie } from './auth-cookie';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt.types';
import { SwitchCompanyDto } from './dto/switch-company.dto';
import { SetBusinessTypeDto } from './dto/set-business-type.dto';
import { ElevateSupportDto, EnterCompanyDto } from './dto/enter-company.dto';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private publish(
    res: Response,
    result: { accessToken: string; refreshToken?: string; user: unknown },
  ) {
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 15 : 60,
    },
  })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.login(dto.email, dto.password, dto.companyId),
    );
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 8 : 30,
    },
  })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.register(
        dto.name,
        dto.email,
        dto.password,
        dto.companyName,
        dto.acceptTerms,
        dto.acceptPrivacy,
      ),
    );
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 20 : 60,
    },
  })
  @Get('google')
  startGoogle(
    @Query('returnTo') returnTo: string | undefined,
    @Query('companyId') companyId: string | undefined,
    @Query('popup') popup: string | undefined,
    @Query('mobile') mobile: string | undefined,
    @Res() res: Response,
  ) {
    res.redirect(
      302,
      this.auth.buildGoogleAuthorizeRedirect(
        returnTo,
        companyId,
        popup === '1' || popup === 'true',
        mobile === '1' || mobile === 'true',
      ),
    );
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 20 : 60,
    },
  })
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.auth.handleGoogleOAuthCallback({
      code,
      state,
      error,
    });
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken);
    res.redirect(302, result.url);
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 20 : 60,
    },
  })
  @Post('google')
  async google(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.googleLogin(dto.idToken, dto.companyName);
    if (result.kind === 'signup') {
      return {
        needsSignup: true,
        signupToken: result.signupToken,
        email: result.email,
        name: result.name,
      };
    }
    return this.publish(res, result);
  }

  @Throttle({
    default: {
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 8 : 30,
    },
  })
  @Post('google/complete')
  async completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(res, await this.auth.completeGoogleSignup(dto));
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Headers('x-vos-client') client: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (client !== 'web') {
      throw new UnauthorizedException('Sesión inválida');
    }
    const refreshToken = readCookie(req.headers.cookie, REFRESH_COOKIE);
    if (!refreshToken) throw new UnauthorizedException('Sesión inválida');
    return this.publish(res, await this.auth.refresh(refreshToken));
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Headers('x-vos-client') client: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (client !== 'web') {
      throw new UnauthorizedException('Sesión inválida');
    }
    const refreshToken = readCookie(req.headers.cookie, REFRESH_COOKIE);
    if (refreshToken) await this.auth.logoutByRefresh(refreshToken);
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user);
  }

  @Post('switch-company')
  @UseGuards(JwtAuthGuard)
  async switchCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.switchCompany(user.sub, dto.companyId, user.sid),
    );
  }

  @Post('platform/enter-company')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  async enterCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EnterCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.enterCompanyAsPlatformAdmin(
        user.sub,
        dto.companyId,
        dto.reason,
        user.sid,
      ),
    );
  }

  @Post('platform/elevate')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  async elevate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ElevateSupportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.elevateSupport(user, dto.reason, dto.minutes),
    );
  }

  @Post('platform/home')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  async platformHome(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.exitToPlatformAdmin(user.sub, user.sid),
    );
  }

  @Post('business-setup')
  @UseGuards(JwtAuthGuard)
  async setBusinessType(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetBusinessTypeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.publish(
      res,
      await this.auth.setBusinessType(user.sub, dto.businessType, user.companyId),
    );
  }
}
