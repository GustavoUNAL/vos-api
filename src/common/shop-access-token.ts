import { createHash, randomBytes } from 'crypto';

export function newShopAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShopAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
