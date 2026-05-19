import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { JsonSerializeInterceptor } from './common/json-serialize.interceptor';

const isProd = process.env.NODE_ENV === 'production';

function corsOriginOption():
  | boolean
  | string[]
  | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (isProd) {
    return true;
  }
  const devDefaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (devDefaults.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new JsonSerializeInterceptor());
  app.enableCors({
    origin: corsOriginOption(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = Number(process.env.PORT) || 3000;
  /** En Docker / detrás de nginx, 127.0.0.1-only puede dar 502 al proxy; 0.0.0.0 escucha en todas las interfaces. */
  const host = process.env.LISTEN_HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
  Logger.log(`HTTP ${host}:${port}`, 'Bootstrap');
}

bootstrap().catch((err: NodeJS.ErrnoException) => {
  const port = process.env.PORT ?? 3000;
  if (err.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `\nPuerto ${port} ya en uso. Probablemente el API ya está corriendo.\n` +
        `  • Probar: curl http://localhost:${port}/navigation\n` +
        `  • Ver proceso: lsof -i :${port}\n` +
        `  • Reiniciar: kill $(lsof -t -i :${port}) && npm run start:dev\n`,
    );
    process.exit(1);
  }
  throw err;
});
