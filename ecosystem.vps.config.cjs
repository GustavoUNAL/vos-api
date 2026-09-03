/**
 * PM2 — VOS AI en VPS (API :3001 + front preview :5174).
 *
 * El puerto :3000 lo usa Next.js "arandano" — no usarlo.
 * Nginx (vos-ia.com) hace proxy a 127.0.0.1:5174.
 *
 * Uso:
 *   cd ~/projects/vos-ai/vos-api
 *   ./scripts/deploy-pm2-vps.sh
 *   # o: pm2 delete vos-api vos-front && pm2 start ecosystem.vps.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'vos-api',
      cwd: __dirname,
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'vos-front',
      cwd: `${__dirname}/../vos-front`,
      script: 'npm',
      args: 'run start',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
