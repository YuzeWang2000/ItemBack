import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const oldDatabaseUrl = requiredEnv('OLD_DATABASE_URL');
const oldStorageDir = path.resolve(requiredEnv('OLD_STORAGE_DIR'));
const targetStorageDir = path.resolve(requiredEnv('STORAGE_DIR'));
const current = new PrismaClient();
const old = new PrismaClient({ datasources: { db: { url: oldDatabaseUrl } } });
const copiedFiles = [];

try {
  const source = await readSource();
  await validateSourceAttachments(source.attachments);
  const fingerprint = fingerprintSource(source);
  const manifestPath = path.join(targetStorageDir, '.merge-manifests', `${fingerprint}.json`);

  if (await fileExists(manifestPath)) {
    throw new Error(`这份旧数据已经合并过，清单为 ${manifestPath}`);
  }

  const currentCounts = await readCounts(current);
  printPlan(source, currentCounts, fingerprint);
  if (!apply) {
    process.stdout.write('\n预检通过；本次没有写入。确认备份后使用 --apply 执行合并。\n');
    process.exitCode = 0;
  } else {
    const result = await merge(source);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify({ fingerprint, mergedAt: new Date().toISOString(), ...result }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write(`\n合并完成：${JSON.stringify(result)}\n`);
  }
} catch (error) {
  for (const file of copiedFiles.reverse()) await unlink(file).catch(() => undefined);
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([current.$disconnect(), old.$disconnect()]);
}

async function readSource() {
  const [nodes, tags, nodeTags, attachments, movements] = await Promise.all([
    old.node.findMany({ orderBy: { createdAt: 'asc' } }),
    old.tag.findMany({ orderBy: { createdAt: 'asc' } }),
    old.nodeTag.findMany(),
    old.attachment.findMany({ orderBy: { createdAt: 'asc' } }),
    old.movement.findMany({ orderBy: { movedAt: 'asc' } }),
  ]);
  return { nodes, tags, nodeTags, attachments, movements };
}

async function validateSourceAttachments(attachments) {
  for (const attachment of attachments) {
    const sourcePath = safeStoragePath(oldStorageDir, attachment.storageKey);
    const data = await readFile(sourcePath).catch((error) => {
      throw new Error(`缺少旧附件 ${attachment.storageKey}: ${error.message}`);
    });
    if (data.length !== attachment.size) {
      throw new Error(`旧附件大小不符 ${attachment.storageKey}: 数据库=${attachment.size}, 文件=${data.length}`);
    }
    const checksum = createHash('sha256').update(data).digest('hex');
    if (checksum !== attachment.checksum) {
      throw new Error(`旧附件校验失败 ${attachment.storageKey}`);
    }
  }
}

async function merge(source) {
  const nodeIds = new Map(source.nodes.map((node) => [node.id, randomUUID()]));
  const attachmentIds = new Map(source.attachments.map((item) => [item.id, randomUUID()]));
  const movementIds = new Map(source.movements.map((item) => [item.id, randomUUID()]));

  return current.$transaction(
    async (tx) => {
      const tagIds = new Map();
      for (const tag of source.tags) {
        const existing = await tx.tag.findUnique({ where: { normalizedName: tag.normalizedName } });
        const merged =
          existing ??
          (await tx.tag.create({
            data: {
              id: randomUUID(),
              name: tag.name,
              normalizedName: tag.normalizedName,
              createdAt: tag.createdAt,
              updatedAt: tag.updatedAt,
            },
          }));
        tagIds.set(tag.id, merged.id);
      }

      const pending = [...source.nodes];
      while (pending.length > 0) {
        let inserted = 0;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
          const node = pending[index];
          if (node.parentId && pending.some((candidate) => candidate.id === node.parentId)) continue;
          await tx.node.create({
            data: {
              id: nodeIds.get(node.id),
              nodeType: node.nodeType,
              parentId: node.parentId ? requireMapping(nodeIds, node.parentId, '节点父级') : null,
              name: node.name,
              description: node.description,
              isContainer: node.isContainer,
              status: node.status,
              acquiredDate: node.acquiredDate,
              endDate: node.endDate,
              expiryDate: node.expiryDate,
              valueAmount: node.valueAmount,
              currency: node.currency,
              quantity: node.quantity,
              brand: node.brand,
              model: node.model,
              serialNumber: node.serialNumber,
              createdAt: node.createdAt,
              updatedAt: node.updatedAt,
              archivedAt: node.archivedAt,
            },
          });
          pending.splice(index, 1);
          inserted += 1;
        }
        if (inserted === 0) throw new Error('旧节点存在循环或缺失的父级，已终止合并');
      }

      for (const attachment of source.attachments) {
        const data = await readFile(safeStoragePath(oldStorageDir, attachment.storageKey));
        const storageKey = newStorageKey(attachment.createdAt);
        const destination = safeStoragePath(targetStorageDir, storageKey);
        await mkdir(path.dirname(destination), { recursive: true });
        const handle = await open(destination, 'wx', 0o600);
        try {
          await handle.writeFile(data);
        } finally {
          await handle.close();
        }
        copiedFiles.push(destination);
        await tx.attachment.create({
          data: {
            id: attachmentIds.get(attachment.id),
            itemId: requireMapping(nodeIds, attachment.itemId, '附件物品'),
            category: attachment.category,
            originalFilename: attachment.originalFilename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            storageKey,
            checksum: attachment.checksum,
            description: attachment.description,
            sortOrder: attachment.sortOrder,
            createdAt: attachment.createdAt,
          },
        });
      }

      for (const nodeTag of source.nodeTags) {
        await tx.nodeTag.create({
          data: {
            nodeId: requireMapping(nodeIds, nodeTag.nodeId, '标签节点'),
            tagId: requireMapping(tagIds, nodeTag.tagId, '标签'),
          },
        });
      }

      for (const movement of source.movements) {
        await tx.movement.create({
          data: {
            id: movementIds.get(movement.id),
            itemId: requireMapping(nodeIds, movement.itemId, '移动物品'),
            fromParentId: requireMapping(nodeIds, movement.fromParentId, '移动来源'),
            toParentId: requireMapping(nodeIds, movement.toParentId, '移动目标'),
            movedAt: movement.movedAt,
            note: movement.note,
          },
        });
      }

      for (const node of source.nodes) {
        if (!node.coverAttachmentId) continue;
        await tx.node.update({
          where: { id: requireMapping(nodeIds, node.id, '封面节点') },
          data: {
            coverAttachmentId: requireMapping(
              attachmentIds,
              node.coverAttachmentId,
              '封面附件',
            ),
          },
        });
      }

      return {
        nodes: source.nodes.length,
        tagsFromOld: source.tags.length,
        nodeTags: source.nodeTags.length,
        attachments: source.attachments.length,
        movements: source.movements.length,
      };
    },
    { maxWait: 30_000, timeout: 15 * 60_000 },
  );
}

function fingerprintSource(source) {
  const hash = createHash('sha256');
  for (const group of ['nodes', 'tags', 'nodeTags', 'attachments', 'movements']) {
    hash.update(group);
    for (const row of source[group]) hash.update(JSON.stringify(row, jsonReplacer));
  }
  return hash.digest('hex');
}

function jsonReplacer(_key, value) {
  if (value && typeof value === 'object' && typeof value.toJSON === 'function') return value.toJSON();
  return value;
}

async function readCounts(client) {
  const [nodes, tags, nodeTags, attachments, movements] = await Promise.all([
    client.node.count(),
    client.tag.count(),
    client.nodeTag.count(),
    client.attachment.count(),
    client.movement.count(),
  ]);
  return { nodes, tags, nodeTags, attachments, movements };
}

function printPlan(source, currentCounts, fingerprint) {
  process.stdout.write(`旧数据指纹: ${fingerprint}\n`);
  process.stdout.write(`当前数据: ${JSON.stringify(currentCounts)}\n`);
  process.stdout.write(
    `准备导入: ${JSON.stringify({
      nodes: source.nodes.length,
      tags: source.tags.length,
      nodeTags: source.nodeTags.length,
      attachments: source.attachments.length,
      movements: source.movements.length,
    })}\n`,
  );
}

function newStorageKey(createdAt) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.bin`;
}

function safeStoragePath(root, storageKey) {
  if (!/^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.bin$/i.test(storageKey)) {
    throw new Error(`非法附件路径: ${storageKey}`);
  }
  const result = path.resolve(root, ...storageKey.split('/'));
  const relative = path.relative(root, result);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`附件路径越界: ${storageKey}`);
  }
  return result;
}

function requireMapping(map, key, label) {
  const value = map.get(key);
  if (!value) throw new Error(`${label}缺少映射: ${key}`);
  return value;
}

async function fileExists(file) {
  return readFile(file).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}
