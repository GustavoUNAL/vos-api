import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function parseShiftInstant(iso: string, label: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} inválida`);
  }
  return d;
}

export function shiftDateFromInstant(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function computeShiftPay(args: {
  startAt: Date;
  endAt: Date | null;
  hourlyRateCOP: number;
  hoursWorkedOverride?: number | null;
}): { hoursWorked: number; totalPayCOP: number } {
  const rate = args.hourlyRateCOP;
  if (!Number.isFinite(rate) || rate < 0) {
    throw new BadRequestException('Tarifa por hora inválida');
  }

  let hours: number;
  if (
    args.hoursWorkedOverride != null &&
    Number.isFinite(args.hoursWorkedOverride) &&
    args.hoursWorkedOverride >= 0
  ) {
    hours = args.hoursWorkedOverride;
  } else if (args.endAt) {
    const ms = args.endAt.getTime() - args.startAt.getTime();
    if (ms < 0) {
      throw new BadRequestException(
        'La hora de salida debe ser posterior a la de entrada',
      );
    }
    hours = ms / (1000 * 60 * 60);
  } else {
    hours = 0;
  }

  return {
    hoursWorked: Math.round(hours * 10000) / 10000,
    totalPayCOP: Math.round(hours * rate),
  };
}

export function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
