CREATE TYPE "BackgroundRemovalStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNAVAILABLE');

CREATE TABLE "BackgroundRemovalJob" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "sourceAttachmentId" UUID NOT NULL,
  "sourceChecksum" VARCHAR(64) NOT NULL,
  "resultAttachmentId" UUID,
  "algorithmVersion" VARCHAR(100) NOT NULL,
  "status" "BackgroundRemovalStatus" NOT NULL DEFAULT 'QUEUED',
  "errorCode" VARCHAR(100),
  "errorMessage" VARCHAR(500),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BackgroundRemovalJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackgroundRemovalJob_resultAttachmentId_key" ON "BackgroundRemovalJob"("resultAttachmentId");
CREATE UNIQUE INDEX "BackgroundRemovalJob_sourceAttachmentId_algorithmVersion_key" ON "BackgroundRemovalJob"("sourceAttachmentId", "algorithmVersion");
CREATE INDEX "BackgroundRemovalJob_sourceChecksum_algorithmVersion_idx" ON "BackgroundRemovalJob"("sourceChecksum", "algorithmVersion");
CREATE INDEX "BackgroundRemovalJob_itemId_createdAt_idx" ON "BackgroundRemovalJob"("itemId", "createdAt" DESC);
CREATE INDEX "BackgroundRemovalJob_status_createdAt_idx" ON "BackgroundRemovalJob"("status", "createdAt");
ALTER TABLE "BackgroundRemovalJob" ADD CONSTRAINT "BackgroundRemovalJob_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundRemovalJob" ADD CONSTRAINT "BackgroundRemovalJob_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundRemovalJob" ADD CONSTRAINT "BackgroundRemovalJob_resultAttachmentId_fkey" FOREIGN KEY ("resultAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
