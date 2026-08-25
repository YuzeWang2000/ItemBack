ALTER TABLE "Node" ADD COLUMN "coverAttachmentId" UUID;

CREATE INDEX "Node_coverAttachmentId_idx" ON "Node"("coverAttachmentId");

ALTER TABLE "Node"
ADD CONSTRAINT "Node_coverAttachmentId_fkey"
FOREIGN KEY ("coverAttachmentId") REFERENCES "Attachment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
