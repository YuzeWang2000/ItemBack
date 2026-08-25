import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttachmentCategory, NodeType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, type FileStorage } from './storage/storage.interface';
import { UploadAttachmentDto } from './upload-attachment.dto';

const previewMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

export function normalizeOriginalFilename(name: string) {
  const withoutPath = name.replace(/^.*[\\/]/, '');
  const isLatin1 = [...withoutPath].every((character) => character.charCodeAt(0) <= 255);
  const latin1Decoded = isLatin1
    ? Buffer.from(withoutPath, 'latin1').toString('utf8')
    : withoutPath;
  const decoded = latin1Decoded.includes('\uFFFD') ? withoutPath : latin1Decoded;
  const normalized = [...decoded.normalize('NFKC')]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return (normalized || '未命名文件').slice(0, 500);
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(itemId: string, files: Express.Multer.File[], dto: UploadAttachmentDto) {
    const item = await this.prisma.node.findFirst({
      where: { id: itemId, nodeType: NodeType.ITEM, archivedAt: null },
    });
    if (!item) throw new NotFoundException({ code: 'ITEM_NOT_FOUND', message: '物品不存在' });
    if (!files?.length)
      throw new BadRequestException({ code: 'FILES_REQUIRED', message: '请选择至少一个文件' });
    const stored: Array<{ storageKey: string }> = [];
    try {
      const data = [];
      for (const file of files) {
        const saved = await this.storage.save(file.buffer);
        stored.push(saved);
        data.push({
          itemId,
          category: dto.category ?? AttachmentCategory.OTHER,
          originalFilename: normalizeOriginalFilename(file.originalname),
          mimeType: (file.mimetype || 'application/octet-stream').slice(0, 200),
          size: file.size,
          storageKey: saved.storageKey,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        });
      }
      const created = await this.prisma.$transaction(
        data.map((entry) => this.prisma.attachment.create({ data: entry })),
      );
      return created.map((attachment) => this.present(attachment));
    } catch (error) {
      await Promise.all(
        stored.map((entry) => this.storage.remove(entry.storageKey).catch(() => undefined)),
      );
      throw error;
    }
  }

  async list(itemId: string) {
    const exists = await this.prisma.node.findFirst({
      where: { id: itemId, nodeType: NodeType.ITEM, archivedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException({ code: 'ITEM_NOT_FOUND', message: '物品不存在' });
    const files = await this.prisma.attachment.findMany({
      where: { itemId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return files.map((attachment) => this.present(attachment));
  }

  async setCover(itemId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        itemId,
        mimeType: { in: previewMimeTypes },
        item: { nodeType: NodeType.ITEM, archivedAt: null },
      },
      select: { id: true },
    });
    if (!attachment) {
      throw new NotFoundException({
        code: 'PREVIEW_IMAGE_NOT_FOUND',
        message: '所选图片不存在或不属于这个物品',
      });
    }
    await this.prisma.node.update({
      where: { id: itemId },
      data: { coverAttachmentId: attachment.id },
    });
    return { itemId, coverAttachmentId: attachment.id };
  }

  async content(id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, item: { archivedAt: null } },
    });
    if (!attachment)
      throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: '附件不存在' });
    return {
      ...attachment,
      originalFilename: normalizeOriginalFilename(attachment.originalFilename),
      absolutePath: this.storage.resolve(attachment.storageKey),
    };
  }

  async remove(id: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment)
      throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: '附件不存在' });
    await this.prisma.attachment.delete({ where: { id } });
    try {
      await this.storage.remove(attachment.storageKey);
    } catch {
      this.logger.error(`附件数据库记录已删除，但存储文件清理失败: ${attachment.id}`);
    }
    return { id, deleted: true };
  }

  private present<T extends { storageKey: string; originalFilename: string }>(attachment: T) {
    const record = Object.fromEntries(
      Object.entries(attachment).filter(([key]) => key !== 'storageKey'),
    ) as Omit<T, 'storageKey'>;
    return {
      ...record,
      originalFilename: normalizeOriginalFilename(attachment.originalFilename),
    };
  }
}
