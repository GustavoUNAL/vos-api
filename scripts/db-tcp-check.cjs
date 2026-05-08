#!/usr/bin/env node
/**
 * Prueba solo TCP al host:puerto de DATABASE_URL (sin auth TLS de Postgres).
 * Si falla aquí, Prisma dará P1001: revisar Railway activo, URL pública y red.
 */
'use strict';

require('dotenv/config');
const net = require('node:net');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL no está definida.');
  process.exit(1);
}

const u = new URL(raw.replace(/^postgresql:/, 'postgres:'));
const host = u.hostname;
const port = Number(u.port || 5432);

const socket = net.createConnection({ host, port }, () => {
  console.log(`TCP OK → ${host}:${port}`);
  socket.end();
  process.exit(0);
});

socket.on('error', (err) => {
  console.error(`TCP FAIL → ${host}:${port}: ${err.message}`);
  console.error(
    'Comprueba en Railway que Postgres esté en ejecución y copia de nuevo la URL pública (Public network).',
  );
  process.exit(1);
});

socket.setTimeout(15_000, () => {
  console.error('TCP: tiempo de espera agotado.');
  process.exit(1);
});
