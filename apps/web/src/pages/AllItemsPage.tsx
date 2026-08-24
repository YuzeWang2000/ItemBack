import type { ItemStatus, NodeRecord, TagRecord } from '@itemback/contracts';
import { useQuery } from '@tanstack/react-query';
import { Filter, Plus, Tags, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ItemCard, itemStatusLabels } from '../components/ItemCard';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';

interface ItemsResponse {
  items: NodeRecord[];
  total: number;
}

const statusOptions: Array<['ALL' | ItemStatus, string]> = [
  ['ALL', '全部状态'],
  ...(Object.entries(itemStatusLabels).map(([status, label]) => [
    status as ItemStatus,
    label,
  ]) as Array<[ItemStatus, string]>),
];

export function AllItemsPage() {
  const [status, setStatus] = useState<'ALL' | ItemStatus>('ALL');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api<TagRecord[]>('/tags') });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (selectedTags.length) params.set('tags', selectedTags.join(','));
    const suffix = params.toString();
    return `/items${suffix ? `?${suffix}` : ''}`;
  }, [selectedTags, status]);
  const items = useQuery({
    queryKey: ['items', status, selectedTags],
    queryFn: () => api<ItemsResponse>(query),
  });
  const clearFilters = () => {
    setStatus('ALL');
    setSelectedTags([]);
  };
  const toggleTag = (id: string) =>
    setSelectedTags((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    );
  const filtered = status !== 'ALL' || selectedTags.length > 0;

  return (
    <div className="page all-items-page">
      <PageHeader
        eyebrow="不受位置限制"
        title="所有物品"
        description="把完整位置树暂时放在一边，用熟悉的现实物品卡片浏览整个档案。"
        actions={
          <Link className="button primary" to="/items/new">
            <Plus size={17} />
            记录物品
          </Link>
        }
      />
      <section className="all-items-filters" aria-label="物品筛选">
        <div className="filter-heading">
          <span>
            <Filter size={16} />
            筛选物品
          </span>
          {filtered && (
            <button type="button" className="text-link" onClick={clearFilters}>
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>
        <label className="status-select">
          <span>状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'ALL' | ItemStatus)}
          >
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="tag-filter-group">
          <span>
            <Tags size={15} />
            标签
          </span>
          {tags.isLoading ? (
            <small>正在读取标签…</small>
          ) : tags.data?.length ? (
            <div className="tag-filter-list">
              {tags.data.map((tag) => {
                const selected = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={selected ? 'selected' : ''}
                    aria-pressed={selected}
                    onClick={() => toggleTag(tag.id)}
                  >
                    #{tag.name}
                    <small>{tag.itemCount}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <small>给物品添加标签后，可在这里快速筛选。</small>
          )}
          {selectedTags.length > 1 && <small>当前显示同时拥有所选标签的物品。</small>}
        </div>
      </section>
      {items.isLoading ? (
        <Loading label="正在整理所有物品…" />
      ) : items.error || !items.data ? (
        <Notice>所有物品加载失败。</Notice>
      ) : items.data.items.length ? (
        <>
          <div className="all-items-summary">
            <strong>{items.data.total}</strong>
            <span>{filtered ? '件符合筛选条件' : '件物品收录在档'}</span>
          </div>
          <div className="item-grid all-items-grid">
            {items.data.items.map((item) => (
              <ItemCard item={item} key={item.id} showPath />
            ))}
          </div>
        </>
      ) : (
        <Empty
          title={filtered ? '没有符合条件的物品' : '还没有记录物品'}
          detail={filtered ? '试试减少标签或切换状态。' : '记录第一件物品后，它会出现在这里。'}
          action={
            filtered ? (
              <button className="button secondary" type="button" onClick={clearFilters}>
                清除筛选
              </button>
            ) : (
              <Link className="button primary" to="/items/new">
                <Plus size={17} />
                记录第一件物品
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
