import { AttachmentCategory, ItemStatus, NodeType, Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

async function ensureNode(
  name: string,
  nodeType: NodeType,
  parentId: string | null,
  data: Prisma.NodeUncheckedCreateInput,
) {
  const existing = await prisma.node.findFirst({
    where: { name, nodeType, parentId, archivedAt: null },
  });
  if (existing) return prisma.node.update({ where: { id: existing.id }, data });
  return prisma.node.create({ data });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@itemback.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'change-this-password';
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must contain at least 8 characters');
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await hash(password, 12) },
  });

  const home = await ensureNode('家', NodeType.SPACE, null, {
    name: '家',
    nodeType: NodeType.SPACE,
    parentId: null,
    isContainer: true,
    description: '日常生活物品的主要空间',
  });
  const office = await ensureNode('公司', NodeType.SPACE, null, {
    name: '公司',
    nodeType: NodeType.SPACE,
    parentId: null,
    isContainer: true,
    description: '工作场所中的个人物品',
  });
  const bag = await ensureNode('通勤书包', NodeType.ITEM, home.id, {
    name: '通勤书包',
    nodeType: NodeType.ITEM,
    parentId: home.id,
    isContainer: true,
    status: ItemStatus.ACTIVE,
    acquiredDate: daysAgo(420),
    valueAmount: new Prisma.Decimal('699.00'),
    currency: 'CNY',
    brand: '示例品牌',
    description: '可以容纳随身物品的示例容器',
  });
  await ensureNode('技术书籍', NodeType.ITEM, bag.id, {
    name: '技术书籍',
    nodeType: NodeType.ITEM,
    parentId: bag.id,
    isContainer: false,
    status: ItemStatus.ACTIVE,
    acquiredDate: daysAgo(180),
    valueAmount: null,
    currency: null,
    description: '未记录价值，用于展示无价值状态',
  });
  await ensureNode('机械键盘', NodeType.ITEM, office.id, {
    name: '机械键盘',
    nodeType: NodeType.ITEM,
    parentId: office.id,
    isContainer: false,
    status: ItemStatus.ACTIVE,
    acquiredDate: null,
    valueAmount: new Prisma.Decimal('899.00'),
    currency: 'CNY',
    brand: 'Keychron',
    model: 'Q1',
    description: '有价值但缺少入手日期的示例',
  });

  void AttachmentCategory.OTHER;
  console.log(`ItemBack seed completed. Login account: ${email}`);
}

main().finally(() => prisma.$disconnect());
