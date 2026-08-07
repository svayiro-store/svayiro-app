import { spawnSync } from 'node:child_process';

const target = String(process.argv[2] || '').toLowerCase();
if (!['customer', 'admin'].includes(target)) {
  console.error('Usage: node scripts/build-frontend.mjs <customer|admin>');
  process.exit(1);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['vite', 'build', '--outDir', `dist/${target}`], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_APP_TARGET: target,
    VITE_PUBLIC_APP_URL: process.env.VITE_PUBLIC_APP_URL || 'https://svayiro.co.in',
    VITE_ADMIN_APP_URL: process.env.VITE_ADMIN_APP_URL || 'https://console.svayiro.co.in',
    VITE_API_URL: process.env.VITE_API_URL || 'https://api.svayiro.co.in'
  }
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status || 0);
