import { Injectable } from '@nestjs/common';
import { NodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CostService } from '../nodes/cost.service';
import { NodesService } from '../nodes/nodes.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostService,
    private readonly nodes: NodesService,
  ) {}

  async get() {
    const [items, spaceCount, recentItems, recentMovements] = await Promise.all([
      this.prisma.node.findMany({ where: { nodeType: NodeType.ITEM, archivedAt: null } }),
      this.prisma.node.count({ where: { nodeType: NodeType.SPACE, archivedAt: null } }),
      this.prisma.node.findMany({
        where: { nodeType: NodeType.ITEM, archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.movement.findMany({
        where: { item: { archivedAt: null } },
        include: {
          item: true,
          fromParent: { select: { id: true, name: true } },
          toParent: { select: { id: true, name: true } },
        },
        orderBy: { movedAt: 'desc' },
        take: 5,
      }),
    ]);
    const values = new Map<string, Prisma.Decimal>();
    const daily = new Map<string, Prisma.Decimal>();
    const longest = items
      .map((item) => ({
        item,
        metric: this.costs.calculate(item.valueAmount, item.acquiredDate, item.endDate),
      }))
      .filter((entry) => entry.metric.holdingDays != null)
      .sort((a, b) => (b.metric.holdingDays ?? 0) - (a.metric.holdingDays ?? 0))
      .slice(0, 5);
    for (const item of items) {
      if (!item.currency || item.valueAmount == null) continue;
      values.set(
        item.currency,
        (values.get(item.currency) ?? new Prisma.Decimal(0)).add(item.valueAmount),
      );
      const metric = this.costs.calculate(item.valueAmount, item.acquiredDate, item.endDate);
      if (metric.dailyCost)
        daily.set(
          item.currency,
          (daily.get(item.currency) ?? new Prisma.Decimal(0)).add(metric.dailyCost),
        );
    }
    const presentWithPath = async (item: (typeof items)[number]) =>
      this.nodes.present(item, await this.nodes.path(item.id));
    return {
      itemCount: items.length,
      spaceCount,
      valueTotals: [...values].map(([currency, amount]) => ({
        currency,
        amount: amount.toFixed(2),
      })),
      dailyCostTotals: [...daily].map(([currency, amount]) => ({
        currency,
        amount: amount.toFixed(4),
      })),
      longestHeld: await Promise.all(longest.map(({ item }) => presentWithPath(item))),
      recentlyAdded: await Promise.all(recentItems.map(presentWithPath)),
      recentlyMoved: await Promise.all(
        recentMovements.map(async (movement) => ({
          id: movement.id,
          movedAt: movement.movedAt,
          note: movement.note,
          fromParent: movement.fromParent,
          toParent: movement.toParent,
          item: await presentWithPath(movement.item),
        })),
      ),
    };
  }
}
