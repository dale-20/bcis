import { copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const app of ['api', 'desktop']) {
  const target = fileURLToPath(new URL(`../apps/${app}/.env`, import.meta.url));
  try { await access(target); console.log(`${app}: existing .env preserved`); }
  catch { await copyFile(`${target}.example`, target); console.log(`${app}: .env created`); }
}
console.log('Next: npm run db:local:init, npm run db:local:start, npm run db:migrate, npm run db:seed:demo, npm run dev');
