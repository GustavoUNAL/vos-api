/**
 * PM2 — VOS AI en VPS (API :3001 + front estático vía Nginx o preview).
 *
 * Uso en el servidor:
 *   cd ~/projects/vos-ai/vos-api
 *   cp .env.production.example .env && nano .env
 *   rm -f .env.local
 *
 *   cd ../vos-front
 *   cp .env.production.example .env && nano .env
 *   rm -f .env.local
 *
 *   cd ../vos-api
 *   ./scripts/deploy-pm2-vps.sh
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
      args: 'run preview -- --host 0.0.0.0 --port 5174',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
