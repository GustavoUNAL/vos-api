import type { Response } from 'express';

export const REFRESH_COOKIE = 'vos_refresh';

export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  const days = Number(process.env.AUTH_REFRESH_DAYS ?? 14);
  const maxAge = (Number.isFinite(days) ? days : 14) * 24 * 60 * 60;
  const parts = [
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearRefreshCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  const parts = [
    `${REFRESH_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
