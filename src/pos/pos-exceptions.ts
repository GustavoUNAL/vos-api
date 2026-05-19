import { HttpException, HttpStatus } from '@nestjs/common';

export function posConflict(message: string, hint?: string): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.CONFLICT, message, ...(hint ? { hint } : {}) },
    HttpStatus.CONFLICT,
  );
}

export function posBadRequest(message: string, hint?: string): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.BAD_REQUEST, message, ...(hint ? { hint } : {}) },
    HttpStatus.BAD_REQUEST,
  );
}

export function posNotFound(message: string, hint?: string): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.NOT_FOUND, message, ...(hint ? { hint } : {}) },
    HttpStatus.NOT_FOUND,
  );
}
