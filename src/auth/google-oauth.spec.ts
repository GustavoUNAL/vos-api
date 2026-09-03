import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  googleAuthorizeUrl,
  googleCallbackErrorCode,
  googleConfig,
  googleFrontRedirect,
  googleOAuthConfigured,
  parseGoogleReturnTo,
  pickActiveMembership,
  sanitizeCompanyIdHint,
} from './google-oauth';

describe('google-oauth', () => {
  it('en producción usa callback de vos-ia.com si falta o es localhost', () => {
    const keys = [
      'NODE_ENV',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      'GOOGLE_FRONT_URL',
    ] as const;
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      process.env.NODE_ENV = 'production';
      process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.GOOGLE_REDIRECT_URI =
        'http://localhost:5173/auth/google/callback';
      process.env.GOOGLE_FRONT_URL = 'http://localhost:5173';
      const cfg = googleConfig();
      expect(cfg.redirectUri).toBe('https://vos-ia.com/auth/google/callback');
      expect(cfg.frontUrl).toBe('https://vos-ia.com');
      expect(googleOAuthConfigured(cfg)).toBe(true);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it('arma la URL de autorización de Google', () => {
    const url = googleAuthorizeUrl({
      clientId: 'cid.apps.googleusercontent.com',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      state: 'abc',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe(
      'cid.apps.googleusercontent.com',
    );
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/google/callback',
    );
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('abc');
    expect(parsed.searchParams.get('scope')).toContain('email');
  });

  it('redirige al hash de login con el JWT', () => {
    expect(
      googleFrontRedirect({
        frontUrl: 'http://localhost:5173',
        returnTo: 'login',
        token: 'jwt-1',
      }),
    ).toBe('http://localhost:5173/#/login?google_token=jwt-1');
  });

  it('redirige a Health con error sin token', () => {
    expect(
      googleFrontRedirect({
        frontUrl: 'https://vos-ia.com/',
        returnTo: 'health',
        error: 'no_account',
      }),
    ).toBe('https://vos-ia.com/#/health/login?google_error=no_account');
  });

  it('redirige al registro con Google cuando hay signup', () => {
    expect(
      googleFrontRedirect({
        frontUrl: 'http://localhost:5173',
        returnTo: 'login',
        signup: 'signup-jwt',
      }),
    ).toBe('http://localhost:5173/#/registro-google?google_signup=signup-jwt');
  });

  it('redirige el popup de registro a la ruta que cierra la ventana', () => {
    expect(
      googleFrontRedirect({
        frontUrl: 'http://localhost:5173',
        returnTo: 'login',
        signup: 'signup-jwt',
        popup: true,
      }),
    ).toBe(
      'http://localhost:5173/#/auth/google/popup?google_signup=signup-jwt',
    );
  });

  it('redirige el popup a una ruta que cierra la ventana', () => {
    expect(
      googleFrontRedirect({
        frontUrl: 'http://localhost:5173',
        returnTo: 'login',
        token: 'jwt-1',
        popup: true,
      }),
    ).toBe('http://localhost:5173/#/auth/google/popup?google_token=jwt-1');
  });

  it('acepta returnTo health y el resto cae a login', () => {
    expect(parseGoogleReturnTo('health')).toBe('health');
    expect(parseGoogleReturnTo('login')).toBe('login');
    expect(parseGoogleReturnTo('https://evil.example')).toBe('login');
  });

  it('mapea errores de Google OAuth a códigos del front', () => {
    expect(
      googleCallbackErrorCode(
        new BadRequestException({
          code: 'GOOGLE_NO_ACCOUNT',
          message: 'No hay cuenta',
        }),
      ),
    ).toBe('no_account');
    expect(
      googleCallbackErrorCode(new UnauthorizedException('Usuario inactivo')),
    ).toBe('inactive');
    expect(
      googleCallbackErrorCode(
        new UnauthorizedException('Usuario sin empresas activas'),
      ),
    ).toBe('no_company');
    expect(googleCallbackErrorCode(new Error('boom'))).toBe('oauth_failed');
  });

  it('ignora pistas de empresa inválidas y prefiere la activa previa', () => {
    expect(sanitizeCompanyIdHint('https://evil.example')).toBeUndefined();
    expect(sanitizeCompanyIdHint('abc')).toBeUndefined();
    expect(sanitizeCompanyIdHint('clxxxxxxxxxxxxxxxxxxxxxx1')).toBe(
      'clxxxxxxxxxxxxxxxxxxxxxx1',
    );
    const memberships = [
      { company: { id: 'company-aaaa-1111-2222-3333', status: 'ACTIVE' } },
      { company: { id: 'company-bbbb-1111-2222-3333', status: 'ACTIVE' } },
      { company: { id: 'company-cccc-1111-2222-3333', status: 'INACTIVE' } },
    ];
    expect(
      pickActiveMembership(memberships, 'company-bbbb-1111-2222-3333')?.company
        .id,
    ).toBe('company-bbbb-1111-2222-3333');
    expect(pickActiveMembership(memberships)?.company.id).toBe(
      'company-aaaa-1111-2222-3333',
    );
    expect(
      pickActiveMembership(memberships, 'company-cccc-1111-2222-3333')?.company
        .id,
    ).toBe('company-aaaa-1111-2222-3333');
  });
});
