import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { Server, WebSocket } from 'ws';
import { JwtPayload } from '../auth/jwt.types';
import type { PosOrderJson, PosTableJson } from './pos-mappers';

@WebSocketGateway({ path: '/pos/ws' })
@Injectable()
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PosGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    const token = this.extractToken(request.url, client);
    if (!token) {
      client.close(4401, 'Token requerido');
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      (client as WebSocket & { user?: JwtPayload }).user = payload;
    } catch {
      client.close(4401, 'Token inválido');
    }
  }

  handleDisconnect(): void {
    /* noop */
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

  private send(payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    this.server?.clients.forEach((c) => {
      if (c.readyState === c.OPEN) {
        c.send(raw);
      }
    });
  }

  emitTablesUpdated(tables: PosTableJson[]): void {
    this.send({ type: 'tables.updated', tables });
  }

  emitOrderUpdated(order: PosOrderJson): void {
    this.send({ type: 'order.updated', order });
  }

  emitOrderClosed(orderId: string, tableId: string, order?: PosOrderJson): void {
    this.send({ type: 'order.closed', orderId, tableId, ...(order ? { order } : {}) });
  }
}
