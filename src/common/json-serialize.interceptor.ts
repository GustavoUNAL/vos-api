import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { sanitizeForJson } from './sanitize-json-response';

@Injectable()
export class JsonSerializeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<{ headersSent?: boolean }>();
    return next.handle().pipe(
      map((data) => {
        if (res?.headersSent) return data;
        return sanitizeForJson(data);
      }),
    );
  }
}
