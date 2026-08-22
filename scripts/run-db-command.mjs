import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(workspace, '.env');
const packageScript = process.argv[2];
const allowedScripts = new Set(['prisma:migrate', 'prisma:seed', 'prisma:reset']);

if (!allowedScripts.has(packageScript)) {
  process.stderr.write(
    'Usage: node scripts/run-db-command.mjs <prisma:migrate|prisma:seed|prisma:reset>\n',
  );
  process.exit(2);
}

if (existsSync(envFile)) loadEnvFile(envFile);

if (!process.env.DATABASE_URL) {
  process.stderr.write(
    'DATABASE_URL is not set. Copy .env.example to the workspace root as .env, then edit it.\n',
  );
  process.exit(1);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const windowsCommand = process.platform === 'win32';
const executable = windowsCommand ? (process.env.ComSpec ?? 'cmd.exe') : pnpm;
const pnpmArgs = ['--filter', '@itemback/api', packageScript];
const executableArgs = windowsCommand ? ['/d', '/s', '/c', pnpm, ...pnpmArgs] : pnpmArgs;
const child = spawn(executable, executableArgs, {
  cwd: workspace,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

child.once('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
