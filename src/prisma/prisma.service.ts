import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { pgPoolConfig } from '../common/pg-pool-config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger = new Logger(PrismaService.name);
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool(pgPoolConfig(connectionString));
    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });

    this.pool = pool;
    // Evita crash del proceso por sockets idle cortados por Neon/AWS.
    pool.on('error', (err) => {
      this.logger.warn(`PG pool error: ${err.message}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
    // Ping liviano: despierta Neon y descarta conexiones zombi del pool.
    this.keepAliveTimer = setInterval(() => {
      void this.pool
        .query('SELECT 1')
        .catch((err: Error) =>
          this.logger.warn(`PG keepalive: ${err.message}`),
        );
    }, 60_000);
    this.keepAliveTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    await this.$disconnect();
    await this.pool.end();
  }
}

