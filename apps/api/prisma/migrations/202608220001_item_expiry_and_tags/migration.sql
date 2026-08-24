ALTER TABLE "Node" ADD COLUMN "expiryDate" DATE;

CREATE TABLE "Tag" (
  "id" UUID NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "normalizedName" VARCHAR(50) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NodeTag" (
  "nodeId" UUID NOT NULL,
  "tagId" UUID NOT NULL,
  CONSTRAINT "NodeTag_pkey" PRIMARY KEY ("nodeId", "tagId")
);

CREATE INDEX "Node_expiryDate_idx" ON "Node"("expiryDate");
CREATE UNIQUE INDEX "Tag_normalizedName_key" ON "Tag"("normalizedName");
CREATE INDEX "Tag_name_idx" ON "Tag"("name");
CREATE INDEX "NodeTag_tagId_nodeId_idx" ON "NodeTag"("tagId", "nodeId");

ALTER TABLE "NodeTag" ADD CONSTRAINT "NodeTag_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NodeTag" ADD CONSTRAINT "NodeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
