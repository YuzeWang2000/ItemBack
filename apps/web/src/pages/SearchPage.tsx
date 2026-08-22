import type { NodeRecord } from '@itemback/contracts';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ItemCard } from '../components/ItemCard';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';

interface SearchResult {
  items: NodeRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [value, setValue] = useState(query);
  const result = useQuery({
    queryKey: ['search', query],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(query)}`),
    enabled: Boolean(query),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(value.trim() ? { q: value.trim() } : {});
  };
  return (
    <div className="page search-page">
      <PageHeader
        eyebrow="跨空间查找"
        title="搜索物品"
        description="按名称、品牌、型号、序列号或描述，找到物品及它现在的完整路径。"
      />
      <form className="search-box" onSubmit={submit}>
        <Search />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入物品名称、品牌或序列号…"
          aria-label="搜索内容"
          autoFocus
        />
        <button className="button primary">搜索</button>
      </form>
      {!query ? (
        <Empty title="你在找什么？" detail="试试“书”“Keychron”或某个序列号。" />
      ) : result.isLoading ? (
        <Loading label="正在翻阅档案…" />
      ) : result.error ? (
        <Notice>搜索失败，请稍后重试。</Notice>
      ) : result.data?.items.length ? (
        <section className="search-results">
          <p className="result-count">找到 {result.data.total} 件相关物品</p>
          {result.data.items.map((item) => (
            <ItemCard item={item} key={item.id} showPath />
          ))}
        </section>
      ) : (
        <Empty title="没有找到相关物品" detail="换一个更短的关键词，或检查物品是否已经归档。" />
      )}
    </div>
  );
}
