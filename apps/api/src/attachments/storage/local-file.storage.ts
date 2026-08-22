import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileStorage } from './storage.interface';

@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = path.resolve(process.cwd(), config.get('STORAGE_DIR') ?? './storage');
  }

  async save(data: Buffer) {
    const date = new Date();
    const bucket = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const storageKey = `${bucket}/${randomUUID()}.bin`;
    const absolutePath = this.resolve(storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const handle = await open(absolutePath, 'wx', 0o600);
    try {
      await handle.writeFile(data);
    } finally {
      await handle.close();
    }
    return { storageKey, absolutePath };
  }

  resolve(storageKey: string) {
    if (!/^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.bin$/i.test(storageKey)) {
      throw new BadRequestException({ code: 'INVALID_STORAGE_KEY', message: '附件存储标识无效' });
    }
    const absolute = path.resolve(this.baseDir, ...storageKey.split('/'));
    const relative = path.relative(this.baseDir, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException({ code: 'INVALID_STORAGE_KEY', message: '附件存储标识无效' });
    }
    return absolute;
  }

  async remove(storageKey: string) {
    await unlink(this.resolve(storageKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
