import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(workspace, relative), 'utf8');
const failures = [];

const [
  packageJsonText,
  operations,
  readme,
  agents,
  productionEnv,
  compose,
  visionRunner,
  visionSource,
] = await Promise.all([
  read('package.json'),
  read('docs/OPERATIONS.md'),
  read('README.md'),
  read('AGENTS.md'),
  read('.env.production.example'),
  read('docker-compose.prod.yml'),
  read('scripts/run-vision-helper.sh'),
  read('native/background-removal-helper/Sources/ItemBackVisionHelper/main.swift'),
]);

const packageJson = JSON.parse(packageJsonText);
const markdownPaths = [
  'README.md',
  'AGENTS.md',
  ...(await readdir(path.join(workspace, 'docs')))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => `docs/${entry}`),
];
const markdownFiles = new Map(
  await Promise.all(markdownPaths.map(async (relative) => [relative, await read(relative)])),
);
const requiredScripts = [
  'dev',
  'verify',
  'prod:init',
  'prod:start',
  'prod:stop',
  'prod:update',
  'prod:status',
  'prod:logs',
  'prod:backup',
  'vision:build',
  'vision:serve',
];

for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json 缺少脚本: ${script}`);
  if (!operations.includes(`pnpm ${script}`))
    failures.push(`OPERATIONS.md 未说明命令: pnpm ${script}`);
}

for (const [relative, markdown] of markdownFiles) {
  for (const command of markdown.matchAll(/\bpnpm ([a-z][a-z0-9:-]*)\b/g)) {
    const script = command[1];
    if (script === 'install' || script === 'exec') continue;
    if (!packageJson.scripts?.[script]) {
      failures.push(`${relative} 引用了不存在的 pnpm 脚本: ${script}`);
    }
  }

  for (const link of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = link[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const absoluteTarget = path.resolve(workspace, path.dirname(relative), target);
    try {
      await access(absoluteTarget);
    } catch {
      failures.push(`${relative} 包含失效的本地链接: ${link[1]}`);
    }
  }
}

for (const service of ['postgres', 'api', 'web']) {
  if (!new RegExp(`^  ${service}:`, 'm').test(compose)) {
    failures.push(`docker-compose.prod.yml 缺少服务: ${service}`);
  }
  if (!operations.includes(`\`${service}\``)) {
    failures.push(`OPERATIONS.md 未说明子系统: ${service}`);
  }
}

for (const variable of [
  'ITEMBACK_DATA_DIR',
  'WEB_ORIGIN',
  'COOKIE_SECURE',
  'VISION_HELPER_MODE',
  'VISION_HELPER_URL',
  'VISION_HELPER_TOKEN',
]) {
  if (!productionEnv.includes(`${variable}=`))
    failures.push(`.env.production.example 缺少: ${variable}`);
  if (!operations.includes(variable)) failures.push(`OPERATIONS.md 未说明环境变量: ${variable}`);
}

if (!visionRunner.includes('exec "$helper" --serve')) {
  failures.push('run-vision-helper.sh 未以前台进程启动 Swift 助手');
}
if (!visionSource.includes('ITEMBACK_VISION_PORT"] ?? "43118"')) {
  failures.push('Swift 助手默认端口不再是 43118，请同步脚本与文档检查');
}
if (!operations.includes('43118'))
  failures.push('OPERATIONS.md 未说明 Apple Vision 默认端口 43118');
if (!operations.includes('Ctrl+C')) failures.push('OPERATIONS.md 未说明如何停止前台进程');
if (!readme.includes('docs/OPERATIONS.md')) failures.push('README.md 缺少运行手册入口');
if (!agents.includes('docs/OPERATIONS.md')) failures.push('AGENTS.md 缺少运行手册约束');
try {
  await access(path.join(workspace, 'scripts/prod-update.sh'));
} catch {
  failures.push('缺少生产更新脚本: scripts/prod-update.sh');
}

if (failures.length > 0) {
  console.error('文档一致性检查失败：');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  '文档一致性检查通过：运行命令、生产子系统、关键环境变量和 Apple Vision 生命周期均已同步。',
);
