import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalFileStorage } from './storage/local-file.storage';
import { FILE_STORAGE } from './storage/storage.interface';
import { BackgroundRemovalRunner } from './background-removal.runner';
import { BackgroundRemovalService } from './background-removal.service';

@Module({
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    LocalFileStorage,
    BackgroundRemovalRunner,
    BackgroundRemovalService,
    { provide: FILE_STORAGE, useExisting: LocalFileStorage },
  ],
})
export class AttachmentsModule {}
