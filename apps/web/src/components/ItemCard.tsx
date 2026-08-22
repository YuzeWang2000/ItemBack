import type { ItemStatus, NodeRecord } from '@itemback/contracts';
import { Box, MapPin, PackageOpen } from 'lucide-react';
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

export function ItemCard({ item, showPath = false }: { item: NodeRecord; showPath?: boolean }) {
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
