import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { Server, WebSocket } from 'ws';
import { JwtPayload } from '../auth/jwt.types';

type ShopWsClient = WebSocket & {
  user?: JwtPayload;
  companyId?: string | null;
};

@WebSocketGateway({ path: '/shop/ws' })
@Injectable()
export class ShopOrdersGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: ShopWsClient, request: IncomingMessage): void {
    const token = this.extractToken(request.url, client);
    if (!token) {
      client.close(4401, 'Token requerido');
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      client.user = payload;
      client.companyId = payload.companyId ?? null;
    } catch {
      client.close(4401, 'Token inválido');
    }
  }

  private extractToken(url: string | undefined, client: WebSocket): string | null {
    if (url) {
      try {
        const parsed = new URL(url, 'http://localhost');
        const q = parsed.searchParams.get('token');
        if (q) return q;
      } catch {
        /* ignore */
      }
    }
    const headers = (client as WebSocket & { protocol?: string }).protocol;
    if (headers?.startsWith('Bearer ')) {
      return headers.slice(7);
    }
    return null;
  }

  emitShopOrderEvent(
    companyId: string,
    type: 'shop-order.created' | 'shop-order.updated',
    order: Record<string, unknown>,
  ): void {
    const raw = JSON.stringify({ type, order });
    this.server?.clients.forEach((c) => {
      const client = c as ShopWsClient;
      if (client.readyState !== client.OPEN) return;
      if (!client.companyId || client.companyId === companyId) {
        client.send(raw);
      }
    });
  }
}
