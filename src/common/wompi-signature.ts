import { createHash, timingSafeEqual } from 'crypto';

export type WompiEventBody = {
  event?: string;
  timestamp?: number;
  signature?: {
    properties?: string[];
    checksum?: string;
  };
  data?: {
    transaction?: {
      id?: string;
      status?: string;
      reference?: string;
      amount_in_cents?: number;
    };
  };
};

function readPath(source: unknown, path: string): string {
  const value = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

/** Checksum documentado por Wompi: valores de properties + timestamp + secreto, en SHA-256 hex. */
export function wompiChecksum(input: {
  data: unknown;
  properties: string[];
  timestamp: number | string;
  secret: string;
}): string {
  const concatenated =
    input.properties
      .map((property) => readPath(input.data, property))
      .join('') +
    String(input.timestamp) +
    input.secret;
  return createHash('sha256').update(concatenated).digest('hex');
}

export function wompiSignatureIsValid(
  body: WompiEventBody,
  secret: string,
): boolean {
  const checksum = body.signature?.checksum?.trim().toLowerCase() ?? '';
  const properties = body.signature?.properties;
  if (!checksum || !properties?.length || body.timestamp == null || !secret) {
    return false;
  }
  const expected = wompiChecksum({
    data: body.data,
    properties,
    timestamp: body.timestamp,
    secret,
  });
  const left = Buffer.from(expected);
  const right = Buffer.from(checksum);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
