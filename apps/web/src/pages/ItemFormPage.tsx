import type { ItemStatus, NodeRecord, TagRecord } from '@itemback/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Box, Camera, ImagePlus, PackageOpen, Plus, Tags, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Field, Loading, Notice, PageHeader } from '../components/ui';

const statuses: Array<[ItemStatus, string]> = [
  ['ACTIVE', '使用中'],
  ['IDLE', '闲置'],
  ['LENT', '借出'],
  ['LOST', '遗失'],
  ['SOLD', '已出售'],
  ['DISPOSED', '已处置'],
];
interface FormState {
  name: string;
  parentId: string;
  description: string;
  isContainer: boolean;
  status: ItemStatus;
  acquiredDate: string;
  endDate: string;
  expiryDate: string;
  valueAmount: string;
  currency: string;
  quantity: string;
  brand: string;
  brandEnglishName: string;
  model: string;
  serialNumber: string;
  tags: string[];
}
const emptyForm: FormState = {
  name: '',
  parentId: '',
  description: '',
  isContainer: false,
  status: 'ACTIVE',
  acquiredDate: '',
  endDate: '',
  expiryDate: '',
  valueAmount: '',
  currency: 'CNY',
  quantity: '1',
  brand: '',
  brandEnglishName: '',
  model: '',
  serialNumber: '',
  tags: [],
};

export function ItemFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const editing = Boolean(id);
  const [form, setForm] = useState<FormState>({
    ...emptyForm,
    parentId: search.get('parent') ?? '',
  });
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const tree = useQuery({ queryKey: ['tree'], queryFn: () => api<NodeRecord[]>('/nodes/tree') });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api<TagRecord[]>('/tags') });
  const current = useQuery({
    queryKey: ['node', id],
    queryFn: () => api<NodeRecord>(`/nodes/${id}`),
    enabled: editing,
  });
  const candidates = useMemo(
    () => flattenContainers(tree.data ?? []).filter((node) => node.id !== id),
    [tree.data, id],
  );
  useEffect(() => {
    if (current.data)
      setForm({
        name: current.data.name,
        parentId: current.data.parentId ?? '',
        description: current.data.description ?? '',
        isContainer: current.data.isContainer,
        status: current.data.status,
        acquiredDate: current.data.acquiredDate ?? '',
        endDate: current.data.endDate ?? '',
        expiryDate: current.data.expiryDate ?? '',
        valueAmount: current.data.valueAmount ?? '',
        currency: current.data.currency ?? 'CNY',
        quantity: String(current.data.quantity),
        brand: current.data.brand ?? '',
        brandEnglishName: current.data.brandEnglishName ?? '',
        model: current.data.model ?? '',
        serialNumber: current.data.serialNumber ?? '',
        tags: current.data.tags.map((tag) => tag.name),
      });
  }, [current.data]);
  useEffect(() => {
    if (!editing && !form.parentId && candidates[0])
      setForm((old) => ({ ...old, parentId: candidates[0].id }));
  }, [candidates, editing, form.parentId]);
  const navigate = useNavigate();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<NodeRecord>(editing ? `/nodes/${id}` : '/items', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }),
  });
  if (tree.isLoading || current.isLoading || tags.isLoading) return <Loading />;
  if (tree.error || current.error || tags.error) return <Notice>表单所需数据加载失败。</Notice>;
  if (!editing && candidates.length === 0)
    return (
      <div className="page narrow-page">
        <Empty
          title="先创建一个空间"
          detail="每件物品都必须属于顶级空间或容器物品。"
          action={
            <Link className="button primary" to="/spaces/new">
              新建空间
            </Link>
          }
        />
      </div>
    );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (form.valueAmount && !form.currency) {
      setError('记录价值时必须选择币种');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || (editing ? null : undefined),
      isContainer: form.isContainer,
      status: form.status,
      acquiredDate: form.acquiredDate || (editing ? null : undefined),
      endDate: form.endDate || (editing ? null : undefined),
      expiryDate: form.expiryDate || (editing ? null : undefined),
      valueAmount: form.valueAmount || (editing ? null : undefined),
      currency: form.valueAmount ? form.currency.toUpperCase() : editing ? null : undefined,
      quantity: Number(form.quantity),
      brand: form.brand || (editing ? null : undefined),
      brandEnglishName: form.brandEnglishName || (editing ? null : undefined),
      model: form.model || (editing ? null : undefined),
      serialNumber: form.serialNumber || (editing ? null : undefined),
      tags: form.tags,
      ...(!editing ? { parentId: form.parentId } : {}),
    };
    try {
      const item = await mutation.mutateAsync(payload);
      let uploadFailed = false;
      if (photos.length) {
        const body = new FormData();
        photos.forEach((photo) => body.append('files', photo));
        body.append('category', 'PHOTO');
        try {
          await api(`/items/${item.id}/attachments`, { method: 'POST', body });
        } catch {
          uploadFailed = true;
        }
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tree'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['node', id] }),
        client.invalidateQueries({ queryKey: ['items'] }),
        client.invalidateQueries({ queryKey: ['tags'] }),
      ]);
      navigate(`/items/${item.id}`, {
        state: uploadFailed
          ? { notice: '物品已保存，但图片上传失败，请在详情页重试。' }
          : undefined,
      });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page form-page">
      <PageHeader
        eyebrow={editing ? '更新档案' : '加入档案'}
        title={editing ? `编辑 ${current.data?.name ?? '物品'}` : '记录一件物品'}
        description="先记录事实，缺少的资料可以以后慢慢补全。"
      />
      <form className="form-panel wide-form" onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <section className="form-section">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2>基本资料</h2>
              <p>能帮助未来的你确认它是什么。</p>
            </div>
          </div>
          <div className="form-grid two">
            <Field label="物品名称">
              <input
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="例如：通勤书包"
                autoFocus
              />
            </Field>
            {!editing && (
              <Field label="所在位置">
                <select
                  required
                  value={form.parentId}
                  onChange={(e) => set('parentId', e.target.value)}
                >
                  {candidates.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.pathLabel}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="品牌中文名或常用名（可选）">
              <input
                maxLength={200}
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                placeholder="例如：耐克"
              />
            </Field>
            <Field label="品牌英文名（可选）">
              <input
                maxLength={200}
                value={form.brandEnglishName}
                onChange={(e) => set('brandEnglishName', e.target.value)}
                placeholder="例如：Nike"
              />
            </Field>
            <Field label="型号（可选）">
              <input
                maxLength={200}
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="型号"
              />
            </Field>
            <Field label="序列号（可选）">
              <input
                maxLength={300}
                value={form.serialNumber}
                onChange={(e) => set('serialNumber', e.target.value)}
                placeholder="序列号或资产编号"
              />
            </Field>
            <Field label="状态">
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as ItemStatus)}
              >
                {statuses.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="说明（可选）">
              <textarea
                className="span-two"
                maxLength={5000}
                rows={4}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="用途、颜色、购买背景或其他想留下的信息"
              />
            </Field>
            <div className="field span-two">
              <span>标签（可多选）</span>
              <TagPicker
                available={tags.data ?? []}
                value={form.tags}
                onChange={(value) => set('tags', value)}
              />
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="section-title">
            <span>02</span>
            <div>
              <h2>位置能力</h2>
              <p>容器可以继续包含其他物品。</p>
            </div>
          </div>
          <button
            type="button"
            className={`container-choice ${form.isContainer ? 'selected' : ''}`}
            onClick={() => set('isContainer', !form.isContainer)}
          >
            <span>{form.isContainer ? <PackageOpen /> : <Box />}</span>
            <div>
              <strong>{form.isContainer ? '这是一个容器物品' : '这是一个普通物品'}</strong>
              <p>{form.isContainer ? '可以在其中继续记录子物品' : '不会包含其他物品'}</p>
            </div>
            <span className="switch" aria-hidden="true" />
          </button>
        </section>
        <section className="form-section">
          <div className="section-title">
            <span>03</span>
            <div>
              <h2>时间与价值</h2>
              <p>金额按定点数保存，不同币种分别统计。</p>
            </div>
          </div>
          <div className="form-grid three">
            <Field label="入手日期">
              <input
                type="date"
                value={form.acquiredDate}
                onChange={(e) => set('acquiredDate', e.target.value)}
              />
            </Field>
            <Field label="结束日期" hint="出售或处置后填写">
              <input
                type="date"
                min={form.acquiredDate || undefined}
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </Field>
            <Field label="有效期至（可选）" hint="适用于食品、药品、耗材等有保质期的物品">
              <input
                type="date"
                min={form.acquiredDate || undefined}
                value={form.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
            </Field>
            <Field label="数量">
              <input
                type="number"
                min="1"
                max="1000000"
                required
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
              />
            </Field>
            <Field label="记录价值">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={form.valueAmount}
                onChange={(e) => set('valueAmount', e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="币种">
              <input
                maxLength={3}
                minLength={3}
                disabled={!form.valueAmount}
                required={Boolean(form.valueAmount)}
                value={form.currency}
                onChange={(e) => set('currency', e.target.value.toUpperCase())}
                placeholder="CNY"
              />
            </Field>
          </div>
        </section>
        <section className="form-section">
          <div className="section-title">
            <span>04</span>
            <div>
              <h2>物品图片</h2>
              <p>可直接调用手机后置摄像头，也可以从本机选择多张图片。</p>
            </div>
          </div>
          <div className="quick-photo-actions">
            <label className="button primary">
              <Camera size={17} />
              随手拍
              <input
                hidden
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  setPhotos((current) =>
                    [...current, ...Array.from(event.target.files ?? [])].slice(0, 20),
                  )
                }
              />
            </label>
            <label className="button secondary">
              <ImagePlus size={17} />
              选择图片
              <input
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  setPhotos((current) =>
                    [...current, ...Array.from(event.target.files ?? [])].slice(0, 20),
                  )
                }
              />
            </label>
            <small>最多 20 张；图片会在物品保存后立即上传。</small>
          </div>
          {photos.length > 0 && (
            <div className="photo-queue">
              {photos.map((photo, index) => (
                <span key={`${photo.name}-${index}`}>
                  {photo.name}
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                    aria-label={`移除 ${photo.name}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
        <div className="form-actions">
          <Link className="button ghost" to={editing ? `/items/${id}` : '/browse'}>
            <ArrowLeft size={17} />
            取消
          </Link>
          <button className="button primary" disabled={saving}>
            {saving ? '正在保存…' : editing ? '保存修改' : '加入档案'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TagPicker({
  available,
  value,
  onChange,
}: {
  available: TagRecord[];
  value: string[];
  onChange(value: string[]): void;
}) {
  const [input, setInput] = useState('');
  const choices = [
    ...new Map(
      [...available.map((tag) => tag.name), ...value].map((name) => [
        name.toLocaleLowerCase(),
        name,
      ]),
    ).values(),
  ];
  const selected = (name: string) =>
    value.some((current) => current.toLocaleLowerCase() === name.toLocaleLowerCase());
  const toggle = (name: string) => {
    if (selected(name)) {
      onChange(value.filter((current) => current.toLocaleLowerCase() !== name.toLocaleLowerCase()));
    } else if (value.length < 20) {
      onChange([...value, name]);
    }
  };
  const add = () => {
    const name = input.trim().replace(/\s+/g, ' ').slice(0, 50);
    if (name && !selected(name) && value.length < 20) onChange([...value, name]);
    setInput('');
  };
  return (
    <div className="tag-picker">
      {choices.length > 0 && (
        <div className="tag-choices">
          {choices.map((name) => (
            <button
              key={name.toLocaleLowerCase()}
              type="button"
              className={selected(name) ? 'selected' : ''}
              aria-pressed={selected(name)}
              onClick={() => toggle(name)}
            >
              <Tags size={13} />#{name}
            </button>
          ))}
        </div>
      )}
      <div className="tag-entry">
        <input
          aria-label="新标签名称"
          maxLength={50}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="输入新标签，按回车添加"
        />
        <button className="button secondary" type="button" onClick={add} disabled={!input.trim()}>
          <Plus size={15} />
          添加
        </button>
      </div>
    </div>
  );
}

function flattenContainers(
  nodes: NodeRecord[],
  prefix: string[] = [],
): Array<NodeRecord & { pathLabel: string }> {
  const result: Array<NodeRecord & { pathLabel: string }> = [];
  for (const node of nodes) {
    const path = [...prefix, node.name];
    if (node.nodeType === 'SPACE' || node.isContainer)
      result.push({ ...node, pathLabel: path.join(' / ') });
    if (node.children) result.push(...flattenContainers(node.children, path));
  }
  return result;
}
