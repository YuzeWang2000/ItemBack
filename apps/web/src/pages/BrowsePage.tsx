import type { ItemStatus, NodeRecord } from '@itemback/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  PackageOpen,
  Plus,
  Warehouse,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ItemCard } from '../components/ItemCard';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';

type ItemFilter = 'ALL' | 'ACTIVE' | 'IDLE' | 'OTHER';
const filters: Array<[ItemFilter, string]> = [
  ['ALL', '全部'],
  ['ACTIVE', '使用中'],
  ['IDLE', '闲置'],
  ['OTHER', '其他状态'],
];
const matchesFilter = (status: ItemStatus, filter: ItemFilter) =>
  filter === 'ALL' ||
  status === filter ||
  (filter === 'OTHER' && status !== 'ACTIVE' && status !== 'IDLE');

export function BrowsePage() {
  const { id } = useParams();
  const [filter, setFilter] = useState<ItemFilter>('ALL');
  const tree = useQuery({ queryKey: ['tree'], queryFn: () => api<NodeRecord[]>('/nodes/tree') });
  const current = useQuery({
    queryKey: ['node', id],
    queryFn: () => api<NodeRecord>(`/nodes/${id}`),
    enabled: Boolean(id),
  });
  const children = useQuery({
    queryKey: ['children', id],
    queryFn: () => api<NodeRecord[]>(`/nodes/${id}/children`),
    enabled: Boolean(id),
  });
  if (tree.isLoading) return <Loading />;
  if (tree.error || !tree.data) return <Notice>空间树加载失败。</Notice>;
  const selected = current.data;
  const visibleChildren = (children.data ?? []).filter((item) =>
    matchesFilter(item.status, filter),
  );
  return (
    <div className="page browse-page">
      <PageHeader
        eyebrow="现实空间"
        title={selected?.name ?? '空间与物品'}
        description={
          selected
            ? selected.path?.map((part) => part.name).join(' / ')
            : '从空间开始，沿着容器找到每一件物品。'
        }
        actions={
          <div className="action-pair">
            <Link className="button secondary" to="/spaces/new">
              <Plus size={17} />
              新建空间
            </Link>
            <Link className="button primary" to={`/items/new${id ? `?parent=${id}` : ''}`}>
              <Plus size={17} />
              记录物品
            </Link>
          </div>
        }
      />
      <div className="browser-layout">
        <aside className="tree-panel">
          <div className="tree-title">
            <FolderOpen size={17} />
            <span>完整位置树</span>
          </div>
          {tree.data.length ? (
            <nav aria-label="物品位置树">
              {tree.data.map((node) => (
                <TreeNode key={node.id} node={node} selectedId={id} />
              ))}
            </nav>
          ) : (
            <p className="tree-empty">还没有空间</p>
          )}
        </aside>
        <section className="contents-panel">
          {!id ? (
            <Empty
              title="从一个空间开始"
              detail="创建“家”“公司”等顶级空间，再把物品放进真实的位置关系中。"
              action={
                <Link className="button primary" to="/spaces/new">
                  <Plus size={17} />
                  创建第一个空间
                </Link>
              }
            />
          ) : current.isLoading || children.isLoading ? (
            <Loading label="正在打开当前位置…" />
          ) : current.error || children.error ? (
            <Notice>当前位置加载失败。</Notice>
          ) : (
            <>
              <div className="location-summary">
                <span className="location-icon">
                  {selected?.nodeType === 'SPACE' ? <Warehouse /> : <Box />}
                </span>
                <div>
                  <small>
                    {selected?.nodeType === 'SPACE'
                      ? '顶级空间'
                      : selected?.isContainer
                        ? '容器物品'
                        : '普通物品'}
                  </small>
                  <h2>{selected?.name}</h2>
                  <p>{selected?.description || '没有补充说明'}</p>
                </div>
                {selected?.nodeType === 'ITEM' && (
                  <Link className="text-link" to={`/items/${selected.id}`}>
                    查看完整档案 <ChevronRight size={15} />
                  </Link>
                )}
              </div>
              <div className="contents-heading">
                <h3>直接包含</h3>
                <span>
                  {visibleChildren.length === (children.data?.length ?? 0)
                    ? `${visibleChildren.length} 件`
                    : `${visibleChildren.length} / ${children.data?.length ?? 0} 件`}
                </span>
              </div>
              {children.data?.length ? (
                <>
                  <div className="item-filters" role="group" aria-label="按物品状态筛选">
                    {filters.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={filter === value ? 'selected' : ''}
                        onClick={() => setFilter(value)}
                        aria-pressed={filter === value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {visibleChildren.length ? (
                    <div className="item-grid">
                      {visibleChildren.map((item) => (
                        <ItemCard item={item} key={item.id} />
                      ))}
                    </div>
                  ) : (
                    <Empty title="这个状态下还没有物品" detail="切换到其他状态查看这里的物品。" />
                  )}
                </>
              ) : (
                <Empty
                  title="这里还是空的"
                  detail={
                    selected?.nodeType === 'ITEM' && !selected.isContainer
                      ? '普通物品不能包含其他物品。'
                      : '把一件物品记录到这个位置，慢慢建立你的档案。'
                  }
                  action={
                    selected?.isContainer ? (
                      <Link className="button secondary" to={`/items/new?parent=${selected.id}`}>
                        <Plus size={17} />
                        放入物品
                      </Link>
                    ) : undefined
                  }
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function TreeNode({ node, selectedId }: { node: NodeRecord; selectedId?: string }) {
  const [open, setOpen] = useState(node.nodeType === 'SPACE');
  const hasChildren = Boolean(node.children?.length);
  return (
    <div className="tree-node">
      <div
        className={`tree-row ${selectedId === node.id ? 'selected' : ''}`}
        style={{ paddingLeft: `${(node.path?.length ?? 0) * 8}px` }}
      >
        <button
          type="button"
          className="tree-toggle"
          disabled={!hasChildren}
          onClick={() => setOpen(!open)}
          aria-label={open ? '收起' : '展开'}
        >
          {hasChildren ? open ? <ChevronDown /> : <ChevronRight /> : <span />}
        </button>
        <Link to={`/browse/${node.id}`}>
          {node.nodeType === 'SPACE' ? <Warehouse /> : node.isContainer ? <PackageOpen /> : <Box />}
          <span>{node.name}</span>
        </Link>
      </div>
      {open &&
        node.children?.map((child) => (
          <div className="tree-child" key={child.id}>
            <TreeNode node={child} selectedId={selectedId} />
          </div>
        ))}
    </div>
  );
}
