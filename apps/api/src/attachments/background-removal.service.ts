import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { BackgroundRemovalStatus, NodeType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, type FileStorage } from './storage/storage.interface';
import { Inject } from '@nestjs/common';
import {
  BACKGROUND_ALGORITHM_VERSION,
  BackgroundRemovalRunner,
  BackgroundRemovalRunnerError,
} from './background-removal.runner';

const supportedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

@Injectable()
export class BackgroundRemovalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackgroundRemovalService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: BackgroundRemovalRunner,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async onApplicationBootstrap() {
    await this.prisma.backgroundRemovalJob.updateMany({
      where: { status: BackgroundRemovalStatus.PROCESSING },
      data: { status: BackgroundRemovalStatus.QUEUED, errorCode: null, errorMessage: null },
    });
    this.schedule();
  }

  async request(attachmentId: string) {
    const source = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, item: { nodeType: NodeType.ITEM, archivedAt: null } },
    });
    if (!source)
      throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: '图片附件不存在' });
    if (!supportedMimeTypes.has(source.mimeType.toLowerCase())) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_IMAGE_TYPE',
        message: '此附件类型不支持本地抠图',
      });
    }
    const existing = await this.prisma.backgroundRemovalJob.findUnique({
      where: {
        sourceAttachmentId_algorithmVersion: {
          sourceAttachmentId: source.id,
          algorithmVersion: BACKGROUND_ALGORITHM_VERSION,
        },
      },
    });
    if (existing?.status === BackgroundRemovalStatus.SUCCEEDED && existing.resultAttachmentId)
      return existing;
    const available = this.runner.isConfigured();
    const status = available ? BackgroundRemovalStatus.QUEUED : BackgroundRemovalStatus.UNAVAILABLE;
    const job = existing
      ? await this.prisma.backgroundRemovalJob.update({
          where: { id: existing.id },
          data: {
            status,
            resultAttachmentId: null,
            errorCode: available ? null : 'BACKGROUND_REMOVAL_UNAVAILABLE',
            errorMessage: available ? null : '当前部署未配置 macOS 本地系统抠图助手',
            completedAt: available ? null : new Date(),
          },
        })
      : await this.prisma.backgroundRemovalJob.create({
          data: {
            itemId: source.itemId,
            sourceAttachmentId: source.id,
            sourceChecksum: source.checksum,
            algorithmVersion: BACKGROUND_ALGORITHM_VERSION,
            status,
            errorCode: available ? null : 'BACKGROUND_REMOVAL_UNAVAILABLE',
            errorMessage: available ? null : '当前部署未配置 macOS 本地系统抠图助手',
            completedAt: available ? null : new Date(),
          },
        });
    if (available) this.schedule();
    return job;
  }

  async get(jobId: string) {
    const job = await this.prisma.backgroundRemovalJob.findUnique({ where: { id: jobId } });
    if (!job)
      throw new NotFoundException({
        code: 'BACKGROUND_REMOVAL_NOT_FOUND',
        message: '抠图任务不存在',
      });
    return job;
  }

  async list(itemId: string) {
    const exists = await this.prisma.node.findFirst({
      where: { id: itemId, nodeType: NodeType.ITEM, archivedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException({ code: 'ITEM_NOT_FOUND', message: '物品不存在' });
    return this.prisma.backgroundRemovalJob.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private schedule() {
    if (this.running) return;
    this.running = true;
    setImmediate(() => void this.drain());
  }

  private async drain() {
    try {
      while (true) {
        const next = await this.prisma.backgroundRemovalJob.findFirst({
          where: { status: BackgroundRemovalStatus.QUEUED },
          orderBy: { createdAt: 'asc' },
        });
        if (!next) break;
        await this.process(next.id);
      }
    } finally {
      this.running = false;
      const pending = await this.prisma.backgroundRemovalJob.count({
        where: { status: BackgroundRemovalStatus.QUEUED },
      });
      if (pending) this.schedule();
    }
  }

  private async process(jobId: string) {
    const claimed = await this.prisma.backgroundRemovalJob.updateMany({
      where: { id: jobId, status: BackgroundRemovalStatus.QUEUED },
      data: {
        status: BackgroundRemovalStatus.PROCESSING,
        startedAt: new Date(),
        completedAt: null,
        attemptCount: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    let stored: { storageKey: string } | undefined;
    try {
      const job = await this.prisma.backgroundRemovalJob.findUnique({
        where: { id: jobId },
        include: { sourceAttachment: true },
      });
      if (!job) return;
      const input = await readFile(this.storage.resolve(job.sourceAttachment.storageKey));
      if (createHash('sha256').update(input).digest('hex') !== job.sourceChecksum) {
        throw new BackgroundRemovalRunnerError(
          'SOURCE_CHECKSUM_MISMATCH',
          '原图校验失败，请重新上传',
        );
      }
      const output = await this.runner.process(input);
      stored = await this.storage.save(output);
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.attachment.create({
          data: {
            itemId: job.itemId,
            category: 'PHOTO',
            originalFilename:
              `${job.sourceAttachment.originalFilename.replace(/\.[^.]+$/, '')}-无背景.png`.slice(
                0,
                500,
              ),
            mimeType: 'image/png',
            size: output.length,
            storageKey: stored!.storageKey,
            checksum: createHash('sha256').update(output).digest('hex'),
            description: '由 macOS Apple Vision 在本机生成；原图已保留',
            sortOrder: job.sourceAttachment.sortOrder + 1,
          },
        });
        await tx.backgroundRemovalJob.update({
          where: { id: job.id },
          data: {
            status: BackgroundRemovalStatus.SUCCEEDED,
            resultAttachmentId: result.id,
            errorCode: null,
            errorMessage: null,
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (stored) await this.storage.remove(stored.storageKey).catch(() => undefined);
      const known = error instanceof BackgroundRemovalRunnerError ? error : undefined;
      this.logger.warn(`背景移除任务 ${jobId} 失败: ${known?.code ?? 'BACKGROUND_REMOVAL_FAILED'}`);
      await this.prisma.backgroundRemovalJob
        .update({
          where: { id: jobId },
          data: {
            status: known?.unavailable
              ? BackgroundRemovalStatus.UNAVAILABLE
              : BackgroundRemovalStatus.FAILED,
            errorCode: known?.code ?? 'BACKGROUND_REMOVAL_FAILED',
            errorMessage: known?.message ?? '本地系统抠图失败',
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
}
