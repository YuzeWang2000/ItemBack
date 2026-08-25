import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './upload-attachment.dto';

const maxFileSize = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB ?? 25)) * 1024 * 1024;
const inlineTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

@ApiTags('attachments')
@ApiCookieAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('items/:itemId/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: maxFileSize, files: 20 },
    }),
  )
  upload(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadAttachmentDto,
  ) {
    return this.attachments.upload(itemId, files, dto);
  }

  @Get('items/:itemId/attachments')
  list(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.attachments.list(itemId);
  }

  @Patch('items/:itemId/cover/:attachmentId')
  setCover(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.setCover(itemId, attachmentId);
  }

  @Get('attachments/:id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.attachments.content(id);
    const canInline = !download && inlineTypes.has(file.mimeType.toLowerCase());
    const encoded = encodeURIComponent(file.originalFilename).replace(/['()]/g, escape);
    response.set({
      'Content-Type': canInline ? file.mimeType : 'application/octet-stream',
      'Content-Length': String(file.size),
      'Content-Disposition': `${canInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    });
    createReadStream(file.absolutePath)
      .on('error', () => response.destroy())
      .pipe(response);
  }

  @Delete('attachments/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.remove(id);
  }
}
