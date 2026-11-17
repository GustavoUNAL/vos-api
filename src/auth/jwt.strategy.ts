import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSessionService } from './auth-session.service';
import { JwtPayload } from './jwt.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessions: AuthSessionService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Sesión inválida');
    }
    if (!payload.sid) {
      const allowLegacy =
        process.env.NODE_ENV !== 'production' &&
        process.env.AUTH_REJECT_LEGACY_JWT !== 'true';
      if (allowLegacy) return payload;
      throw new UnauthorizedException('Sesión expirada. Volvé a entrar.');
    }
    await this.sessions.assertActive(payload.sid, payload.sub);
    return payload;
  }
}
