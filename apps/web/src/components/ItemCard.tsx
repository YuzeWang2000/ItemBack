import type { ItemStatus, NodeRecord } from '@itemback/contracts';
import { Box, CalendarClock, MapPin, PackageOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { contentUrl } from '../api';
import { formatMoney } from './ui';

export const itemStatusLabels: Record<ItemStatus, string> = {
  ACTIVE: '使用中',
  IDLE: '闲置',
  LENT: '借出',
  LOST: '遗失',
  SOLD: '已出售',
  DISPOSED: '已处置',
};

export function getExpiryState(expiryDate: string | null) {
  if (!expiryDate) return null;
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.ceil((expiry - todayUtc) / 86_400_000);
  if (days < 0) return { tone: 'expired', label: `已过期 ${Math.abs(days)} 天` };
  if (days === 0) return { tone: 'soon', label: '今天到期' };
  if (days <= 30) return { tone: 'soon', label: `${days} 天后到期` };
  return { tone: 'normal', label: `有效期至 ${expiryDate}` };
}

export function ItemCard({ item, showPath = false }: { item: NodeRecord; showPath?: boolean }) {
  const expiry = getExpiryState(item.expiryDate);
  const pathLabel = item.path
    ?.slice(0, -1)
    .map((part) => part.name)
    .join(' / ');
  return (
    <Link className="item-card" to={`/items/${item.id}`} aria-label={`查看物品 ${item.name}`}>
      <div className="item-card-media">
        <span className={`item-card-fallback ${item.isContainer ? 'container' : ''}`}>
          {item.isContainer ? <PackageOpen /> : <Box />}
        </span>
        {item.coverAttachmentId && (
          <img
            src={contentUrl(item.coverAttachmentId)}
            alt={`${item.name} 的图片`}
            loading="lazy"
          />
        )}
        <span className={`item-status status-${item.status.toLowerCase()}`}>
          <i aria-hidden="true" />
          {itemStatusLabels[item.status]}
        </span>
      </div>
      <div className="item-card-body">
        <div className="item-card-heading">
          <span aria-hidden="true">{item.isContainer ? <PackageOpen /> : <Box />}</span>
          <strong title={item.name}>{item.name}</strong>
        </div>
        {(item.brand || item.model) && (
          <p className="item-card-description">
            {[item.brand, item.model].filter(Boolean).join(' · ')}
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="item-card-tags" aria-label="物品标签">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag.id}>#{tag.name}</span>
            ))}
            {item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}
          </div>
        )}
        {expiry && (
          <span className={`expiry-note ${expiry.tone}`}>
            <CalendarClock />
            {expiry.label}
          </span>
        )}
        <div className="item-card-meta">
          <span>{formatMoney(item.valueAmount, item.currency)}</span>
          <span>{item.holdingDays == null ? '未记录日期' : `${item.holdingDays} 天`}</span>
        </div>
        <strong className="item-card-cost">
          {item.dailyCost
            ? `${formatMoney(item.dailyCost, item.currency, 2)} / 天`
            : item.valueAmount == null
              ? '未记录日均成本'
              : '缺少入手日期'}
        </strong>
        {showPath && pathLabel && (
          <small className="item-card-path">
            <MapPin />
            {pathLabel}
          </small>
        )}
      </div>
    </Link>
  );
}
