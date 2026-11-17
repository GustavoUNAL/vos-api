import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from '../auth/auth-session.service';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { Server, WebSocket } from 'ws';
import { shouldDeliverShopEvent } from '../common/security-policy';
import { JwtPayload } from '../auth/jwt.types';

type ShopWsClient = WebSocket & {
  user?: JwtPayload;
  companyId?: string | null;
  authed?: boolean;
};

@WebSocketGateway({ path: '/shop/ws' })
@Injectable()
export class ShopOrdersGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: AuthSessionService,
  ) {}

  handleConnection(client: ShopWsClient, _request: IncomingMessage): void {
    client.companyId = null;
    client.authed = false;
    const timer = setTimeout(() => {
      if (!client.authed) client.close(4401, 'Auth requerida');
    }, 5000);

    client.on('message', (raw) => {
      if (client.authed) return;
      void (async () => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            token?: string;
          };
          if (msg?.type !== 'auth' || typeof msg.token !== 'string' || !msg.token) {
            client.close(4401, 'Auth requerida');
            return;
          }
          const payload = this.jwt.verify<JwtPayload>(msg.token);
          if (!payload.sid) {
            client.close(4401, 'Auth requerida');
            return;
          }
          if (!payload.companyId) {
            client.close(4403, 'Empresa requerida');
            return;
          }
          await this.sessions.assertActive(payload.sid, payload.sub);
          client.user = payload;
          client.companyId = payload.companyId;
          client.authed = true;
          clearTimeout(timer);
          client.send(JSON.stringify({ type: 'auth.ok' }));
        } catch {
          clearTimeout(timer);
          client.close(4401, 'Token inválido');
        }
      })();
    });
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
      if (shouldDeliverShopEvent(client.companyId, companyId)) {
        client.send(raw);
      }
    });
  }
}
