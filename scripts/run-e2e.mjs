import path from 'node:path';
import { run, start, startTestDatabase, waitFor, workspace } from './test-infra.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const { postgres, env } = await startTestDatabase('e2e');
env.STORAGE_DIR = path.join(workspace, '.test-data', 'e2e-storage');
env.PORT = '3000';
env.WEB_ORIGIN = 'http://127.0.0.1:5173';
env.VITE_API_URL = 'http://127.0.0.1:3000/api/v1';
let apiProcess;
let webProcess;
try {
  await run(pnpm, ['build'], { env });
  await run(pnpm, ['--filter', '@itemback/api', 'exec', 'prisma', 'migrate', 'deploy'], { env });
  await run(pnpm, ['db:seed'], { env });
  apiProcess = start(process.execPath, ['dist/main.js'], {
    cwd: path.join(workspace, 'apps', 'api'),
    env,
  });
  webProcess = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    cwd: path.join(workspace, 'apps', 'web'),
    env,
  });
  await Promise.all([
    waitFor('http://127.0.0.1:3000/api/v1/health'),
    waitFor('http://127.0.0.1:5173/login'),
  ]);
  await run(pnpm, ['exec', 'playwright', 'test'], {
    env: { ...env, ITEMBACK_MANAGED_SERVERS: '1' },
  });
} finally {
  apiProcess?.kill();
  webProcess?.kill();
  await postgres.stop().catch(() => undefined);
}
