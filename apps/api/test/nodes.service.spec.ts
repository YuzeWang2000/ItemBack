import { ConflictException } from '@nestjs/common';
import { ItemStatus, NodeType, type Node } from '@prisma/client';
import { CostService } from '../src/nodes/cost.service';
import { NodesService } from '../src/nodes/nodes.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const id = {
  item: '00000000-0000-4000-8000-000000000001',
  home: '00000000-0000-4000-8000-000000000002',
  child: '00000000-0000-4000-8000-000000000003',
};
const makeNode = (data: Partial<Node>): Node => ({
  id: id.item,
  nodeType: NodeType.ITEM,
  parentId: id.home,
  coverAttachmentId: null,
  name: '书包',
  description: null,
  isContainer: true,
  status: ItemStatus.ACTIVE,
  acquiredDate: null,
  endDate: null,
  expiryDate: null,
  valueAmount: null,
  currency: null,
  quantity: 1,
  brand: null,
  model: null,
  serialNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  ...data,
});

describe('NodesService hierarchy rules', () => {
  it('rejects a normal item as parent', async () => {
    const prisma = {
      node: {
        findFirst: jest.fn().mockResolvedValue(makeNode({ id: id.home, isContainer: false })),
      },
    };
    const service = new NodesService(prisma as unknown as PrismaService, new CostService());
    await expect(service.assertValidParent(id.home)).rejects.toMatchObject({
      response: { code: 'PARENT_NOT_CONTAINER' },
    });
  });

  it('rejects moving an item into its descendant', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(makeNode({ id: id.item, parentId: id.home, isContainer: true }))
      .mockResolvedValueOnce(makeNode({ id: id.child, parentId: id.item, isContainer: true }));
    const prisma = {
      node: { findFirst, findUnique: jest.fn().mockResolvedValueOnce({ parentId: id.item }) },
    };
    const service = new NodesService(prisma as unknown as PrismaService, new CostService());
    await expect(service.move(id.item, { toParentId: id.child })).rejects.toMatchObject({
      response: { code: 'MOVE_TO_DESCENDANT' },
    });
  });

  it('rejects moving an item into itself', async () => {
    const prisma = { node: { findFirst: jest.fn().mockResolvedValue(makeNode({ id: id.item })) } };
    const service = new NodesService(prisma as unknown as PrismaService, new CostService());
    await expect(service.move(id.item, { toParentId: id.item })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects archiving a container that still has children', async () => {
    const prisma = {
      node: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(makeNode({ id: id.item }))
          .mockResolvedValueOnce({ id: id.child }),
      },
    };
    const service = new NodesService(prisma as unknown as PrismaService, new CostService());
    await expect(service.archive(id.item)).rejects.toMatchObject({
      response: { code: 'NODE_NOT_EMPTY' },
    });
  });
});
