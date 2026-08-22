import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Warehouse } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { NodeRecord } from '@itemback/contracts';
import { api, ApiError } from '../api';
import { Field, Notice, PageHeader } from '../components/ui';

export function SpaceFormPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api<NodeRecord>('/spaces', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined }),
      }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const space = await mutation.mutateAsync();
      await client.invalidateQueries({ queryKey: ['tree'] });
      navigate(`/browse/${space.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '空间创建失败');
    }
  };
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow="顶级位置"
        title="新建空间"
        description="空间是物品树的起点，例如家、公司、宿舍或工作室。"
      />
      <form className="form-panel" onSubmit={submit}>
        <div className="form-symbol">
          <Warehouse />
        </div>
        {error && <Notice>{error}</Notice>}
        <Field label="空间名称">
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：家"
            autoFocus
          />
        </Field>
        <Field label="说明（可选）">
          <textarea
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="记录这个空间的用途或范围"
            rows={4}
          />
        </Field>
        <div className="form-actions">
          <Link className="button ghost" to="/browse">
            <ArrowLeft size={17} />
            取消
          </Link>
          <button className="button primary" disabled={mutation.isPending}>
            {mutation.isPending ? '正在创建…' : '创建空间'}
          </button>
        </div>
      </form>
    </div>
  );
}
