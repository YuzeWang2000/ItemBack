import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(workspace, '.test-data');

export async function startTestDatabase(label) {
  const databaseDir = path.join(testRoot, `postgres-${label}`);
  assertTestPath(databaseDir);
  await rm(databaseDir, { recursive: true, force: true });
  const port = label === 'e2e' ? 55433 : 55432;
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'itemback',
    password: 'itemback-test-password',
    port,
    persistent: false,
    onError: (error) => process.stderr.write(`[test-postgres] ${String(error)}\n`),
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('itemback_test');
  return {
    postgres,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: `postgresql://itemback:itemback-test-password@127.0.0.1:${port}/itemback_test?schema=public`,
      ADMIN_EMAIL: 'admin@itemback.test',
      ADMIN_PASSWORD: 'itemback-test-password',
      SESSION_DAYS: '1',
      COOKIE_SECURE: 'false',
    },
  };
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const windowsCommand = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
    const executable = windowsCommand ? (process.env.ComSpec ?? 'cmd.exe') : command;
    const executableArgs = windowsCommand ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(executable, executableArgs, {
      cwd: workspace,
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}

export function start(command, args, options = {}) {
  return spawn(command, args, { cwd: workspace, stdio: 'inherit', shell: false, ...options });
}

export async function waitFor(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* service is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function cleanupTestPath(relative) {
  const target = path.resolve(testRoot, relative);
  assertTestPath(target);
  await rm(target, { recursive: true, force: true });
}

function assertTestPath(target) {
  const relative = path.relative(testRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove unsafe test path: ${target}`);
  }
}
