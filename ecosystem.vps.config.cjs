/**
 * PM2 — VOS AI en VPS (API :3001 + front Vite :5174).
 *
 * Uso en el servidor:
 *   cd ~/projects/vos-ai/vos-api
 *   cp .env.vps.example .env && nano .env
 *   rm -f .env.local          # importante: no pisar .env en producción
 *   npm ci && npx prisma generate && npm run build
 *   npm run db:migrate
 *
 *   cd ../vos-front
 *   cp .env.vps.example .env.local && nano .env.local
 *
 *   cd ../vos-api
 *   pm2 start ecosystem.vps.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'vos-api',
      cwd: __dirname,
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'vos-front',
      cwd: `${__dirname}/../vos-front`,
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 5174',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
