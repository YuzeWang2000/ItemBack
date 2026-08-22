CREATE TYPE "NodeType" AS ENUM ('SPACE', 'ITEM');
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'IDLE', 'LENT', 'LOST', 'SOLD', 'DISPOSED');
CREATE TYPE "AttachmentCategory" AS ENUM ('PHOTO', 'MANUAL', 'SERIAL', 'RECEIPT', 'WARRANTY', 'OTHER');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Node" (
  "id" UUID NOT NULL,
  "nodeType" "NodeType" NOT NULL,
  "parentId" UUID,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "isContainer" BOOLEAN NOT NULL DEFAULT false,
  "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "acquiredDate" DATE,
  "endDate" DATE,
  "valueAmount" DECIMAL(19,4),
  "currency" VARCHAR(3),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "brand" VARCHAR(200),
  "model" VARCHAR(200),
  "serialNumber" VARCHAR(300),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Movement" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "fromParentId" UUID NOT NULL,
  "toParentId" UUID NOT NULL,
  "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" VARCHAR(500),
  CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Attachment" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "category" "AttachmentCategory" NOT NULL DEFAULT 'OTHER',
  "originalFilename" VARCHAR(500) NOT NULL,
  "mimeType" VARCHAR(200) NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" VARCHAR(200) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "description" VARCHAR(1000),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "Node_parentId_idx" ON "Node"("parentId");
CREATE INDEX "Node_nodeType_archivedAt_idx" ON "Node"("nodeType", "archivedAt");
CREATE INDEX "Node_name_idx" ON "Node"("name");
CREATE INDEX "Movement_itemId_movedAt_idx" ON "Movement"("itemId", "movedAt" DESC);
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_itemId_sortOrder_createdAt_idx" ON "Attachment"("itemId", "sortOrder", "createdAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_fromParentId_fkey" FOREIGN KEY ("fromParentId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_toParentId_fkey" FOREIGN KEY ("toParentId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
