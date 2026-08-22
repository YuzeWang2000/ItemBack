import type { NodeRecord } from '@itemback/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, CalendarClock, MapPin, Plus, Sparkles, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, formatDate, formatMoney, Loading, Notice, PageHeader } from '../components/ui';

interface Dashboard {
  itemCount: number;
  spaceCount: number;
  valueTotals: Array<{ currency: string; amount: string }>;
  dailyCostTotals: Array<{ currency: string; amount: string }>;
  longestHeld: NodeRecord[];
  recentlyAdded: NodeRecord[];
  recentlyMoved: Array<{
    id: string;
    movedAt: string;
    item: NodeRecord;
    fromParent: { name: string };
    toParent: { name: string };
  }>;
}

export function DashboardPage() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <Notice>仪表盘加载失败，请稍后重试。</Notice>;
  const data = query.data;
  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="今日档案"
        title="你的物品，仍在时间里"
        description="从位置、价值与持有时间三个角度，重新看清自己拥有的东西。"
        actions={
          <Link className="button primary" to="/items/new">
            <Plus size={17} />
            记录物品
          </Link>
        }
      />
      <section className="stat-grid">
        <article className="stat-card">
          <span className="stat-icon">
            <Boxes />
          </span>
          <div>
            <p>在档物品</p>
            <strong>{data.itemCount}</strong>
            <small>件未归档物品</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Warehouse />
          </span>
          <div>
            <p>顶级空间</p>
            <strong>{data.spaceCount}</strong>
            <small>处物品所在空间</small>
          </div>
        </article>
        <article className="stat-card value-card">
          <div>
            <p>已记录价值</p>
            {data.valueTotals.length ? (
              data.valueTotals.map((total) => (
                <strong key={total.currency}>{formatMoney(total.amount, total.currency)}</strong>
              ))
            ) : (
              <strong className="muted-number">暂无</strong>
            )}
          </div>
        </article>
        <article className="stat-card value-card">
          <div>
            <p>当前日均成本</p>
            {data.dailyCostTotals.length ? (
              data.dailyCostTotals.map((total) => (
                <strong key={total.currency}>
                  {formatMoney(total.amount, total.currency, 4)}
                  <small> / 天</small>
                </strong>
              ))
            ) : (
              <strong className="muted-number">暂无</strong>
            )}
          </div>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="panel time-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">时间留下的刻度</p>
              <h2>持有时间最长</h2>
            </div>
            <CalendarClock />
          </div>
          {data.longestHeld.length ? (
            <div className="timeline-list">
              {data.longestHeld.map((item, index) => (
                <Link to={`/items/${item.id}`} key={item.id} className="timeline-row">
                  <span className="timeline-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      <MapPin size={13} />
                      {item.path?.map((part) => part.name).join(' / ')}
                    </p>
                  </div>
                  <span className="days">{item.holdingDays} 天</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="时间档案还未开始" detail="为物品记录入手日期后，它会出现在这里。" />
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">最近归档</p>
              <h2>新加入的物品</h2>
            </div>
            <Sparkles />
          </div>
          {data.recentlyAdded.length ? (
            <div className="simple-list">
              {data.recentlyAdded.map((item) => (
                <Link to={`/items/${item.id}`} key={item.id}>
                  <span className={`kind-dot ${item.isContainer ? 'container' : ''}`} />
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.path
                        ?.slice(0, -1)
                        .map((part) => part.name)
                        .join(' / ')}
                    </p>
                  </div>
                  <time>{formatDate(item.createdAt)}</time>
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="尚未记录物品"
              action={
                <Link to="/items/new" className="text-link">
                  记录第一件 <ArrowRight size={15} />
                </Link>
              }
            />
          )}
        </article>
      </section>
      <section className="panel recent-moves">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">位置变化</p>
            <h2>最近移动</h2>
          </div>
          <Link className="text-link" to="/browse">
            查看空间 <ArrowRight size={15} />
          </Link>
        </div>
        {data.recentlyMoved.length ? (
          <div className="move-grid">
            {data.recentlyMoved.map((move) => (
              <Link to={`/items/${move.item.id}`} key={move.id}>
                <strong>{move.item.name}</strong>
                <p>
                  <span>{move.fromParent.name}</span>
                  <ArrowRight size={14} />
                  <span>{move.toParent.name}</span>
                </p>
                <time>{formatDate(move.movedAt)}</time>
              </Link>
            ))}
          </div>
        ) : (
          <p className="quiet-line">还没有移动记录。物品换位置后，这里会留下清晰的轨迹。</p>
        )}
      </section>
    </div>
  );
}
