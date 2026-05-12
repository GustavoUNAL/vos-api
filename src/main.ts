import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
