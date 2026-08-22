import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Node, NodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CostService } from './cost.service';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateSpaceDto } from './dto/create-space.dto';
import { MoveItemDto } from './dto/move-item.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

const clean = (value: string | undefined) => value?.trim() || undefined;
const dateValue = (value: string | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined;

const coverInclude = Prisma.validator<Prisma.NodeInclude>()({
  attachments: {
    where: {
      mimeType: { in: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'] },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 1,
    select: { id: true },
  },
});
@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostService,
  ) {}

  async createSpace(dto: CreateSpaceDto) {
    const node = await this.prisma.node.create({
      data: {
        nodeType: NodeType.SPACE,
        name: dto.name.trim(),
        description: clean(dto.description),
        isContainer: true,
      },
    });
    return this.present(node);
  }

  async listSpaces() {
    const spaces = await this.prisma.node.findMany({
      where: { nodeType: NodeType.SPACE, archivedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    return spaces.map((node) => this.present(node));
  }

  async createItem(dto: CreateItemDto) {
    await this.assertValidParent(dto.parentId);
    this.validateDates(dto.acquiredDate, dto.endDate);
    const node = await this.prisma.node.create({ data: this.itemData(dto) });
    return this.present(node, await this.path(node.id));
  }

  async get(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id }, include: coverInclude });
    if (!node) throw new NotFoundException({ code: 'NODE_NOT_FOUND', message: '空间或物品不存在' });
    return this.present(node, await this.path(id));
  }

  async children(id: string) {
    await this.requireNode(id);
    const nodes = await this.prisma.node.findMany({
      where: { parentId: id, archivedAt: null },
      include: coverInclude,
      orderBy: [{ nodeType: 'asc' }, { name: 'asc' }],
    });
    return nodes.map((node) => this.present(node));
  }

  async tree() {
    const nodes = await this.prisma.node.findMany({
      where: { archivedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    const mapped = new Map<string, ReturnType<NodesService['present']> & { children: unknown[] }>();
    for (const node of nodes) mapped.set(node.id, { ...this.present(node), children: [] });
    const roots: Array<ReturnType<NodesService['present']> & { children: unknown[] }> = [];
    for (const node of nodes) {
      const current = mapped.get(node.id)!;
      if (node.parentId && mapped.has(node.parentId))
        mapped.get(node.parentId)!.children.push(current);
      else roots.push(current);
    }
    return roots;
  }

  async path(id: string) {
    const result: Array<{ id: string; name: string; nodeType: NodeType }> = [];
    let current: Pick<Node, 'id' | 'name' | 'nodeType' | 'parentId'> | null =
      await this.prisma.node.findUnique({
        where: { id },
        select: { id: true, name: true, nodeType: true, parentId: true },
      });
    if (!current)
      throw new NotFoundException({ code: 'NODE_NOT_FOUND', message: '空间或物品不存在' });
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current.id))
        throw new ConflictException({ code: 'TREE_CORRUPTED', message: '检测到无效的层级循环' });
      seen.add(current.id);
      result.unshift({ id: current.id, name: current.name, nodeType: current.nodeType });
      current = current.parentId
        ? await this.prisma.node.findUnique({
            where: { id: current.parentId },
            select: { id: true, name: true, nodeType: true, parentId: true },
          })
        : null;
    }
    return result;
  }

  async update(id: string, dto: UpdateNodeDto) {
    const current = await this.requireNode(id);
    if (current.nodeType === NodeType.SPACE && (dto.isContainer === false || dto.status)) {
      throw new BadRequestException({
        code: 'SPACE_RULE_VIOLATION',
        message: '空间始终可容纳物品且不使用物品状态',
      });
    }
    if (dto.isContainer === false) {
      const child = await this.prisma.node.findFirst({
        where: { parentId: id, archivedAt: null },
        select: { id: true },
      });
      if (child)
        throw new ConflictException({
          code: 'CONTAINER_NOT_EMPTY',
          message: '仍包含物品，不能改为普通物品',
        });
    }
    this.validateDates(dto.acquiredDate, dto.endDate, current);
    if (
      dto.valueAmount !== undefined &&
      dto.valueAmount !== null &&
      !dto.currency &&
      !current.currency
    ) {
      throw new BadRequestException({
        code: 'CURRENCY_REQUIRED',
        message: '记录价值时必须选择币种',
      });
    }
    const data: Prisma.NodeUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: clean(dto.description) ?? null } : {}),
      ...(dto.isContainer !== undefined ? { isContainer: dto.isContainer } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.acquiredDate !== undefined
        ? { acquiredDate: dateValue(dto.acquiredDate) ?? null }
        : {}),
      ...(dto.endDate !== undefined ? { endDate: dateValue(dto.endDate) ?? null } : {}),
      ...(dto.valueAmount !== undefined
        ? { valueAmount: dto.valueAmount ? new Prisma.Decimal(dto.valueAmount) : null }
        : {}),
      ...(dto.currency !== undefined
        ? { currency: clean(dto.currency)?.toUpperCase() ?? null }
        : {}),
      ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
      ...(dto.brand !== undefined ? { brand: clean(dto.brand) ?? null } : {}),
      ...(dto.model !== undefined ? { model: clean(dto.model) ?? null } : {}),
      ...(dto.serialNumber !== undefined ? { serialNumber: clean(dto.serialNumber) ?? null } : {}),
    };
    const node = await this.prisma.node.update({ where: { id }, data });
    return this.present(node, await this.path(id));
  }

  async archive(id: string) {
    const node = await this.requireNode(id);
    const child = await this.prisma.node.findFirst({
      where: { parentId: id, archivedAt: null },
      select: { id: true },
    });
    if (child)
      throw new ConflictException({ code: 'NODE_NOT_EMPTY', message: '仍包含物品，不能归档' });
    await this.prisma.node.update({ where: { id }, data: { archivedAt: new Date() } });
    return { id: node.id, archived: true };
  }

  async move(id: string, dto: MoveItemDto) {
    const item = await this.requireNode(id);
    if (item.nodeType !== NodeType.ITEM || !item.parentId) {
      throw new BadRequestException({ code: 'SPACE_CANNOT_MOVE', message: '顶级空间不能移动' });
    }
    if (dto.toParentId === id)
      throw new ConflictException({ code: 'MOVE_TO_SELF', message: '不能把物品移动到自身' });
    await this.assertValidParent(dto.toParentId);
    if (item.parentId === dto.toParentId) return this.get(id);
    let cursor: string | null = dto.toParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id)
        throw new ConflictException({
          code: 'MOVE_TO_DESCENDANT',
          message: '不能把物品移动到自己的后代中',
        });
      if (seen.has(cursor))
        throw new ConflictException({ code: 'TREE_CORRUPTED', message: '目标层级存在循环' });
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await this.prisma.node.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
    await this.prisma.$transaction([
      this.prisma.node.update({ where: { id }, data: { parentId: dto.toParentId } }),
      this.prisma.movement.create({
        data: {
          itemId: id,
          fromParentId: item.parentId,
          toParentId: dto.toParentId,
          note: clean(dto.note),
        },
      }),
    ]);
    return this.get(id);
  }

  async movements(id: string) {
    await this.requireNode(id, true);
    return this.prisma.movement.findMany({
      where: { itemId: id },
      include: {
        fromParent: { select: { id: true, name: true } },
        toParent: { select: { id: true, name: true } },
      },
      orderBy: { movedAt: 'desc' },
      take: 50,
    });
  }

  async search(rawQuery: string, page = 1, pageSize = 20) {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!query) return { items: [], page, pageSize, total: 0 };
    const where: Prisma.NodeWhereInput = {
      nodeType: NodeType.ITEM,
      archivedAt: null,
      OR: ['name', 'brand', 'model', 'serialNumber', 'description'].map((field) => ({
        [field]: { contains: query, mode: 'insensitive' },
      })),
    };
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const [nodes, total] = await this.prisma.$transaction([
      this.prisma.node.findMany({
        where,
        include: coverInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      this.prisma.node.count({ where }),
    ]);
    const items = await Promise.all(
      nodes.map(async (node) => this.present(node, await this.path(node.id))),
    );
    return { items, page: safePage, pageSize: safeSize, total };
  }

  async assertValidParent(id: string) {
    const parent = await this.requireNode(id);
    if (parent.nodeType === NodeType.ITEM && !parent.isContainer) {
      throw new ConflictException({
        code: 'PARENT_NOT_CONTAINER',
        message: '目标物品不能容纳其他物品',
      });
    }
    return parent;
  }

  private async requireNode(id: string, includeArchived = false) {
    const node = await this.prisma.node.findFirst({
      where: { id, ...(includeArchived ? {} : { archivedAt: null }) },
    });
    if (!node) throw new NotFoundException({ code: 'NODE_NOT_FOUND', message: '空间或物品不存在' });
    return node;
  }

  private itemData(dto: CreateItemDto): Prisma.NodeUncheckedCreateInput {
    return {
      nodeType: NodeType.ITEM,
      parentId: dto.parentId,
      name: dto.name.trim(),
      description: clean(dto.description),
      isContainer: dto.isContainer ?? false,
      status: dto.status,
      acquiredDate: dateValue(dto.acquiredDate),
      endDate: dateValue(dto.endDate),
      valueAmount: dto.valueAmount ? new Prisma.Decimal(dto.valueAmount) : undefined,
      currency: clean(dto.currency)?.toUpperCase(),
      quantity: dto.quantity ?? 1,
      brand: clean(dto.brand),
      model: clean(dto.model),
      serialNumber: clean(dto.serialNumber),
    };
  }

  private validateDates(acquired?: string, end?: string, existing?: Node) {
    const start = dateValue(acquired) ?? existing?.acquiredDate ?? null;
    const finish = dateValue(end) ?? existing?.endDate ?? null;
    if (start && finish && finish < start) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: '结束日期不能早于入手日期',
      });
    }
  }

  present(
    node: Node & { attachments?: Array<{ id: string }> },
    path?: Array<{ id: string; name: string; nodeType: NodeType }>,
  ) {
    const { attachments, ...record } = node;
    const metrics =
      node.nodeType === NodeType.ITEM
        ? this.costs.calculate(node.valueAmount, node.acquiredDate, node.endDate)
        : { holdingDays: null, dailyCost: null };
    return {
      ...record,
      valueAmount: node.valueAmount?.toString() ?? null,
      acquiredDate: node.acquiredDate?.toISOString().slice(0, 10) ?? null,
      endDate: node.endDate?.toISOString().slice(0, 10) ?? null,
      coverAttachmentId: attachments?.[0]?.id ?? null,
      ...metrics,
      ...(path ? { path } : {}),
    };
  }
}
