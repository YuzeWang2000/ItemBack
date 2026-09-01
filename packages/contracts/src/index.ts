export const nodeTypes = ['SPACE', 'ITEM'] as const;
export type NodeType = (typeof nodeTypes)[number];

export const itemStatuses = ['ACTIVE', 'IDLE', 'LENT', 'LOST', 'SOLD', 'DISPOSED'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const attachmentCategories = [
  'PHOTO',
  'MANUAL',
  'SERIAL',
  'RECEIPT',
  'WARRANTY',
  'OTHER',
] as const;
export type AttachmentCategory = (typeof attachmentCategories)[number];

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, string[]>;
  timestamp: string;
  path: string;
}

export interface NodeRecord {
  id: string;
  nodeType: NodeType;
  parentId: string | null;
  name: string;
  description: string | null;
  isContainer: boolean;
  status: ItemStatus;
  acquiredDate: string | null;
  endDate: string | null;
  expiryDate: string | null;
  valueAmount: string | null;
  currency: string | null;
  quantity: number;
  brand: string | null;
  brandEnglishName: string | null;
  model: string | null;
  serialNumber: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  holdingDays: number | null;
  dailyCost: string | null;
  coverAttachmentId: string | null;
  tags: TagRecord[];
  path?: Array<{ id: string; name: string; nodeType: NodeType }>;
  children?: NodeRecord[];
}

export interface TagRecord {
  id: string;
  name: string;
  itemCount?: number;
}

export interface AttachmentRecord {
  id: string;
  itemId: string;
  category: AttachmentCategory;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
}

export const backgroundRemovalStatuses = [
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'UNAVAILABLE',
] as const;
export type BackgroundRemovalStatus = (typeof backgroundRemovalStatuses)[number];

export interface BackgroundRemovalJobRecord {
  id: string;
  itemId: string;
  sourceAttachmentId: string;
  resultAttachmentId: string | null;
  algorithmVersion: string;
  status: BackgroundRemovalStatus;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MovementRecord {
  id: string;
  itemId: string;
  fromParentId: string;
  toParentId: string;
  movedAt: string;
  note: string | null;
  fromParent: { id: string; name: string };
  toParent: { id: string; name: string };
}
