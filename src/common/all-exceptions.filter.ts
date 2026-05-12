import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const isProd = process.env.NODE_ENV === 'production';

type PrismaKnown = { code: string; message: string; meta?: Record<string, unknown> };

function prismaKnownRequest(exception: unknown): PrismaKnown | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const ex = exception as Record<string, unknown>;
  if (ex.name !== 'PrismaClientKnownRequestError') return null;
  if (typeof ex.code !== 'string') return null;
  const meta =
    typeof ex.meta === 'object' && ex.meta !== null
      ? (ex.meta as Record<string, unknown>)
      : undefined;
  return { code: ex.code, message: String(ex.message ?? ''), meta };
}

function prismaValidationMessage(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const ex = exception as Record<string, unknown>;
  if (ex.name !== 'PrismaClientValidationError') return null;
  return String(ex.message ?? '');
}

function prismaInitMessage(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const ex = exception as Record<string, unknown>;
  if (ex.name !== 'PrismaClientInitializationError') return null;
  return String(ex.message ?? '');
}

function connectionLikeText(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('connect') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('closed the connection') ||
    m.includes("can't reach database") ||
    m.includes('p1001') ||
    m.includes('connection closed') ||
    m.includes('connection terminated')
  );
}

function resolvePrismaResponse(prismaErr: PrismaKnown): {
  status: number;
  message: string;
  hint: string;
} {
  const rawMsg = prismaErr.message;
  const metaDriver =
    typeof prismaErr.meta?.driverAdapterError === 'object' &&
    prismaErr.meta?.driverAdapterError !== null
      ? String(
          (prismaErr.meta.driverAdapterError as Record<string, unknown>).message ??
            '',
        )
      : '';

  const connectionHint =
    'Comprueba DATABASE_URL en .env, que Postgres esté en marcha (Docker o local) y ejecuta: npm run db:migrate';

  switch (prismaErr.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Registro duplicado (violación de unicidad).',
        hint: 'Revisa campos únicos (email, código de lote, etc.).',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Registro no encontrado.',
        hint: 'El id o recurso ya no existe o fue eliminado.',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Referencia inválida (clave foránea).',
        hint: 'El id relacionado no existe en la tabla padre.',
      };
    case 'P1001':
    case 'P1017':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'No se pudo conectar a la base de datos o la conexión se cerró antes de tiempo.',
        hint: connectionHint,
      };
    /** Raw query / driver: suele ser conexión caída, TLS o servidor que cierra el socket. */
    case 'P2010':
      if (connectionLikeText(rawMsg) || connectionLikeText(metaDriver)) {
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'No se pudo completar la consulta: la base de datos cerró la conexión o no está disponible.',
          hint: connectionHint,
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        message: isProd
          ? 'La consulta a base de datos falló (P2010).'
          : rawMsg || 'Raw query failed.',
        hint: 'Revisa migraciones y que el esquema coincida con prisma/schema.prisma.',
      };
    case 'P2024':
      return {
        status: HttpStatus.GATEWAY_TIMEOUT,
        message: 'Tiempo de espera agotado al hablar con la base de datos.',
        hint: 'Revisa carga del servidor o aumenta timeouts en el proveedor de Postgres.',
      };
    case 'P2034':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Conflicto de transacción. Vuelve a intentar la operación.',
        hint: 'Dos escrituras simultáneas chocaron; reintenta en unos segundos.',
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        message: isProd
          ? `Operación no válida en base de datos (${prismaErr.code}).`
          : rawMsg || `Error Prisma ${prismaErr.code}`,
        hint:
          'Si acabas de clonar el repo: npm run db:migrate && npm run db:seed. Revisa logs del servidor para el detalle técnico.',
      };
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;
    let hint: string | undefined;
    const meta: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message: unknown }).message;
        message = Array.isArray(m) ? m.join(', ') : String(m);
      }
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} — ${message}`,
          exception.stack,
        );
      }
    } else {
      const prismaErr = prismaKnownRequest(exception);
      if (prismaErr) {
        code = prismaErr.code;
        meta.prismaCode = prismaErr.code;
        const resolved = resolvePrismaResponse(prismaErr);
        status = resolved.status;
        message = resolved.message;
        hint = resolved.hint;
        this.logger.warn(
          `${request.method} ${request.url} — Prisma ${prismaErr.code}: ${prismaErr.message}`,
        );
      } else {
        const valMsg = prismaValidationMessage(exception);
        if (valMsg) {
          status = HttpStatus.BAD_REQUEST;
          code = 'PRISMA_VALIDATION';
          message = isProd
            ? 'Petición inválida (datos o tipos no coinciden con la API).'
            : valMsg;
          hint =
            'Revisa el body JSON: nombres de campos, tipos numéricos y fechas ISO. La API usa class-validator.';
          this.logger.warn(`${request.method} ${request.url} — Prisma validation: ${valMsg}`);
        } else {
          const initMsg = prismaInitMessage(exception);
          if (initMsg) {
            status = HttpStatus.SERVICE_UNAVAILABLE;
            code = 'PRISMA_INIT';
            message = connectionLikeText(initMsg)
              ? 'No se pudo inicializar la conexión a la base de datos.'
              : 'Error al arrancar el cliente de base de datos.';
            hint =
              'DATABASE_URL incorrecta, Postgres detenido o credenciales inválidas. Prueba: npm run db:tcp-check';
            this.logger.error(`${request.method} ${request.url} — Prisma init: ${initMsg}`);
          } else {
            const err = exception instanceof Error ? exception : new Error(String(exception));
            if (connectionLikeText(err.message)) {
              status = HttpStatus.SERVICE_UNAVAILABLE;
              code = 'DB_CONNECTION';
              message =
                'No se pudo conectar a la base de datos (error de red o conexión).';
              hint =
                'DATABASE_URL en .env, Postgres en ejecución (npm run db:local:up con Docker), y npm run db:migrate.';
            } else {
              message = isProd ? 'Internal server error' : err.message;
            }
            this.logger.error(`${request.method} ${request.url} — ${err.message}`, err.stack);
          }
        }
      }
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      message,
      path: request.url,
    };
    if (code) payload.code = code;
    if (hint) payload.hint = hint;
    if (!isProd && exception instanceof Error && !(exception instanceof HttpException)) {
      payload.error = exception.name;
    }
    if (!isProd && Object.keys(meta).length) Object.assign(payload, meta);

    response.status(status).json(payload);
  }
}
