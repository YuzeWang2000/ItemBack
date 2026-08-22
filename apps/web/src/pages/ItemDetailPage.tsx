import type {
  AttachmentCategory,
  AttachmentRecord,
  MovementRecord,
  NodeRecord,
} from '@itemback/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Box,
  CalendarDays,
  Download,
  Edit3,
  File,
  FileImage,
  FileText,
  FolderInput,
  MapPin,
  PackageOpen,
  Paperclip,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, contentUrl } from '../api';
import { ItemCard, itemStatusLabels as statusLabels } from '../components/ItemCard';
import { Empty, formatDate, formatMoney, Loading, Notice, PageHeader } from '../components/ui';

const categoryLabels: Record<AttachmentCategory, string> = {
  PHOTO: '物品照片',
  MANUAL: '说明书',
  SERIAL: '序列号资料',
  RECEIPT: '发票或收据',
  WARRANTY: '保修资料',
  OTHER: '其他文件',
};

export function ItemDetailPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const node = useQuery({ queryKey: ['node', id], queryFn: () => api<NodeRecord>(`/nodes/${id}`) });
  const children = useQuery({
    queryKey: ['children', id],
    queryFn: () => api<NodeRecord[]>(`/nodes/${id}/children`),
  });
  const attachments = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => api<AttachmentRecord[]>(`/items/${id}/attachments`),
  });
  const movements = useQuery({
    queryKey: ['movements', id],
    queryFn: () => api<MovementRecord[]>(`/nodes/${id}/movements`),
  });
  const archive = useMutation({ mutationFn: () => api(`/nodes/${id}`, { method: 'DELETE' }) });
  if (node.isLoading) return <Loading />;
  if (node.error || !node.data) return <Notice>物品档案加载失败或已归档。</Notice>;
  const item = node.data;
  const doArchive = async () => {
    if (!window.confirm(`确定归档“${item.name}”吗？归档后不会出现在当前物品树中。`)) return;
    setNotice(null);
    try {
      await archive.mutateAsync();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tree'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      navigate('/browse');
    } catch (reason) {
      setNotice({ kind: 'error', text: reason instanceof ApiError ? reason.message : '归档失败' });
    }
  };
  return (
    <div className="page detail-page">
      <Link className="back-link" to={`/browse/${item.parentId}`}>
        <ArrowLeft size={16} />
        返回所在位置
      </Link>
      <PageHeader
        eyebrow={item.isContainer ? '容器物品档案' : '物品档案'}
        title={item.name}
        description={item.path?.map((part) => part.name).join(' / ')}
        actions={
          <div className="action-pair">
            <Link className="button secondary" to={`/items/${id}/edit`}>
              <Edit3 size={16} />
              编辑
            </Link>
            <button className="button secondary" onClick={() => setMoving(true)}>
              <FolderInput size={16} />
              移动
            </button>
            <button
              className="button danger subtle"
              onClick={doArchive}
              disabled={archive.isPending}
            >
              <Archive size={16} />
              归档
            </button>
          </div>
        }
      />
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <section className="record-hero">
        <span className={`record-glyph ${item.isContainer ? 'container' : ''}`}>
          {item.isContainer ? <PackageOpen /> : <Box />}
          {item.coverAttachmentId && (
            <img
              src={contentUrl(item.coverAttachmentId)}
              alt={`${item.name} 的图片`}
              loading="eager"
            />
          )}
        </span>
        <div className="record-intro">
          <span className="status-pill">{statusLabels[item.status]}</span>
          <p>{item.description || '这件物品还没有补充说明。'}</p>
          <div className="record-path">
            <MapPin size={15} />
            {item.path?.map((part, index) => (
              <span key={part.id}>
                {index > 0 && <i>/</i>}
                {part.name}
              </span>
            ))}
          </div>
        </div>
        <div className="cost-block">
          <small>平均每日持有成本</small>
          <strong>
            {item.dailyCost
              ? `${formatMoney(item.dailyCost, item.currency, 4)} / 天`
              : item.valueAmount == null
                ? '未记录价值'
                : '无法计算'}
          </strong>
          <p>{item.holdingDays ? `已持有 ${item.holdingDays} 个自然日` : '缺少入手日期'}</p>
        </div>
      </section>
      <div className="detail-columns">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">核心资料</p>
                <h2>关于这件物品</h2>
              </div>
              <ShieldCheck />
            </div>
            <dl className="facts-grid">
              <Fact label="记录价值" value={formatMoney(item.valueAmount, item.currency)} />
              <Fact label="数量" value={`${item.quantity} 件`} />
              <Fact label="入手日期" value={formatDate(item.acquiredDate)} />
              <Fact label="结束日期" value={item.endDate ? formatDate(item.endDate) : '仍在持有'} />
              <Fact label="品牌" value={item.brand || '未记录'} />
              <Fact label="型号" value={item.model || '未记录'} />
              <Fact label="序列号" value={item.serialNumber || '未记录'} />
              <Fact label="档案建立" value={formatDate(item.createdAt)} />
            </dl>
          </section>
          {item.isContainer && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">嵌套关系</p>
                  <h2>内含物品</h2>
                </div>
                <Link className="text-link" to={`/items/new?parent=${item.id}`}>
                  <Plus size={15} />
                  放入物品
                </Link>
              </div>
              {children.data?.length ? (
                <div className="contained-grid">
                  {children.data.map((child) => (
                    <ItemCard item={child} key={child.id} />
                  ))}
                </div>
              ) : (
                <Empty title="容器目前是空的" detail="记录直接放在这里的物品。" />
              )}
            </section>
          )}
          <AttachmentPanel
            itemId={id}
            items={attachments.data ?? []}
            loading={attachments.isLoading}
          />
        </div>
        <aside className="detail-side">
          <section className="panel history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">位置轨迹</p>
                <h2>移动历史</h2>
              </div>
              <CalendarDays />
            </div>
            {movements.data?.length ? (
              <ol>
                {movements.data.map((move) => (
                  <li key={move.id}>
                    <span className="history-dot" />
                    <time>{formatDate(move.movedAt)}</time>
                    <p>
                      <strong>{move.fromParent.name}</strong>
                      <ArrowRight size={13} />
                      <strong>{move.toParent.name}</strong>
                    </p>
                    {move.note && <small>{move.note}</small>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="quiet-line">尚未移动过。第一次更换位置后，会在这里留下记录。</p>
            )}
          </section>
        </aside>
      </div>
      {moving && (
        <MoveDialog
          item={item}
          onClose={() => setMoving(false)}
          onMoved={() => {
            setMoving(false);
            setNotice({ kind: 'success', text: '位置已更新，移动历史已记录。' });
          }}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AttachmentPanel({
  itemId,
  items,
  loading,
}: {
  itemId: string;
  items: AttachmentRecord[];
  loading: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<AttachmentCategory>('PHOTO');
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      files.forEach((file) => body.append('files', file));
      body.append('category', category);
      if (description) body.append('description', description);
      return api(`/items/${itemId}/attachments`, { method: 'POST', body });
    },
  });
  const accept = (list: FileList | null) => {
    if (list) setFiles((old) => [...old, ...Array.from(list)].slice(0, 20));
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await upload.mutateAsync();
      setFiles([]);
      setDescription('');
      if (input.current) input.current.value = '';
      await Promise.all([
        client.invalidateQueries({ queryKey: ['attachments', itemId] }),
        client.invalidateQueries({ queryKey: ['node', itemId] }),
        client.invalidateQueries({ queryKey: ['children'] }),
        client.invalidateQueries({ queryKey: ['search'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setMessage({ kind: 'success', text: '附件已安全保存。' });
    } catch (reason) {
      setMessage({ kind: 'error', text: reason instanceof ApiError ? reason.message : '上传失败' });
    }
  };
  const remove = async (file: AttachmentRecord) => {
    if (!window.confirm(`删除附件“${file.originalFilename}”吗？此操作会同步删除存储文件。`)) return;
    try {
      await api(`/attachments/${file.id}`, { method: 'DELETE' });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['attachments', itemId] }),
        client.invalidateQueries({ queryKey: ['node', itemId] }),
        client.invalidateQueries({ queryKey: ['children'] }),
        client.invalidateQueries({ queryKey: ['search'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    } catch (reason) {
      setMessage({ kind: 'error', text: reason instanceof ApiError ? reason.message : '删除失败' });
    }
  };
  return (
    <section className="panel attachment-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">数字资料</p>
          <h2>图片与附件</h2>
        </div>
        <Paperclip />
      </div>
      <form onSubmit={submit}>
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') input.current?.click();
          }}
        >
          <UploadCloud />
          <strong>拖入文件，或点击选择</strong>
          <p>支持图片、PDF、文档与压缩包；单个文件上限由服务端配置。</p>
          <input ref={input} type="file" multiple hidden onChange={(e) => accept(e.target.files)} />
        </div>
        {files.length > 0 && (
          <div className="upload-queue">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`}>
                {file.name}
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  aria-label={`移除 ${file.name}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="upload-controls">
          <label>
            <span>附件分类</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>说明（可选）</span>
            <input
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：2026 年购买发票"
            />
          </label>
          <button className="button secondary" disabled={!files.length || upload.isPending}>
            {upload.isPending ? '正在上传…' : `上传 ${files.length || ''} 个文件`}
          </button>
        </div>
      </form>
      {loading ? (
        <Loading label="正在读取附件…" />
      ) : items.length ? (
        <div className="attachments-grid">
          {items.map((file) => (
            <article key={file.id}>
              {file.mimeType.startsWith('image/') && file.mimeType !== 'image/svg+xml' ? (
                <a
                  className="attachment-preview"
                  href={contentUrl(file.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={contentUrl(file.id)} alt={file.description || file.originalFilename} />
                </a>
              ) : (
                <span className="file-glyph">
                  {file.mimeType === 'application/pdf' ? (
                    <FileText />
                  ) : file.category === 'PHOTO' ? (
                    <FileImage />
                  ) : (
                    <File />
                  )}
                </span>
              )}
              <div className="file-info">
                <strong title={file.originalFilename}>{file.originalFilename}</strong>
                <p>
                  {categoryLabels[file.category]} · {formatBytes(file.size)}
                </p>
                {file.description && <small>{file.description}</small>}
              </div>
              <div className="file-actions">
                <a
                  className="icon-button"
                  href={contentUrl(file.id, true)}
                  aria-label={`下载 ${file.originalFilename}`}
                >
                  <Download size={16} />
                </a>
                <button
                  className="icon-button danger-text"
                  onClick={() => remove(file)}
                  aria-label={`删除 ${file.originalFilename}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="还没有数字资料" detail="把照片、说明书、发票和保修资料留在物品身边。" />
      )}
    </section>
  );
}

function MoveDialog({
  item,
  onClose,
  onMoved,
}: {
  item: NodeRecord;
  onClose(): void;
  onMoved(): void;
}) {
  const tree = useQuery({ queryKey: ['tree'], queryFn: () => api<NodeRecord[]>('/nodes/tree') });
  const options = useMemo(
    () => flattenTargets(tree.data ?? []).filter((node) => node.id !== item.id),
    [tree.data, item.id],
  );
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const move = useMutation({
    mutationFn: () =>
      api(`/nodes/${item.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ toParentId: target, note: note || undefined }),
      }),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await move.mutateAsync();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['node', item.id] }),
        client.invalidateQueries({ queryKey: ['tree'] }),
        client.invalidateQueries({ queryKey: ['movements', item.id] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onMoved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '移动失败');
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="关闭">
          <X />
        </button>
        <span className="modal-symbol">
          <FolderInput />
        </span>
        <p className="eyebrow">更新现实位置</p>
        <h2 id="move-title">移动“{item.name}”</h2>
        <p>目标只能是空间或容器。服务端会阻止移动到自身或后代节点。</p>
        {error && <Notice>{error}</Notice>}
        <form onSubmit={submit}>
          <label className="field">
            <span>新位置</span>
            <select required value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">请选择目标位置</option>
              {options.map((node) => (
                <option value={node.id} key={node.id} disabled={node.id === item.parentId}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>移动备注（可选）</span>
            <input
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：整理书房"
            />
          </label>
          <div className="form-actions">
            <button className="button ghost" type="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={move.isPending}>
              {move.isPending ? '正在移动…' : '确认移动'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function flattenTargets(
  nodes: NodeRecord[],
  prefix: string[] = [],
): Array<NodeRecord & { label: string }> {
  return nodes.flatMap((node) => {
    const path = [...prefix, node.name];
    const own =
      node.nodeType === 'SPACE' || node.isContainer ? [{ ...node, label: path.join(' / ') }] : [];
    return [...own, ...flattenTargets(node.children ?? [], path)];
  });
}
function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
