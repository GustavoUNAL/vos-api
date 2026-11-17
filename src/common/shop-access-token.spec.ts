import { hashShopAccessToken, newShopAccessToken } from './shop-access-token';

describe('token de consulta de pedido', () => {
  it('entrega un token opaco y solo persiste su hash', () => {
    const token = newShopAccessToken();
    const again = newShopAccessToken();
    expect(token).not.toBe(again);
    expect(token.length).toBeGreaterThan(40);
    expect(hashShopAccessToken(token)).toHaveLength(64);
    expect(hashShopAccessToken(token)).not.toBe(token);
    expect(hashShopAccessToken(token)).toBe(hashShopAccessToken(token));
  });
});
