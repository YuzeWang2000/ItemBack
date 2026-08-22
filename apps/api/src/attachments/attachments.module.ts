import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalFileStorage } from './storage/local-file.storage';
import { FILE_STORAGE } from './storage/storage.interface';

@Module({
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    LocalFileStorage,
    { provide: FILE_STORAGE, useExisting: LocalFileStorage },
  ],
})
export class AttachmentsModule {}
