import path from 'node:path';
import { run, startTestDatabase, workspace } from './test-infra.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const { postgres, env } = await startTestDatabase('integration');
env.STORAGE_DIR = path.join(workspace, '.test-data', 'integration-storage');
try {
  await run(pnpm, ['--filter', '@itemback/api', 'exec', 'prisma', 'migrate', 'deploy'], { env });
  await run(pnpm, ['--filter', '@itemback/api', 'test:integration'], { env });
} finally {
  await postgres.stop().catch(() => undefined);
}
