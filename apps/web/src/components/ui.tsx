import { AlertCircle, CalendarRange, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="lede">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Loading({ label = '正在整理档案…' }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <LoaderCircle className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">○</div>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

export function Notice({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{children}</span>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function DateInput({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  min?: string;
  max?: string;
  onChange(value: string): void;
}) {
  const id = useId();
  const fallback = new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [jumpError, setJumpError] = useState('');

  useEffect(() => {
    const [nextYear, nextMonth, nextDay] = (value || fallback).split('-');
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);
  }, [fallback, value]);

  const dayCount = useMemo(() => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) return 31;
    return new Date(numericYear, numericMonth, 0).getDate();
  }, [month, year]);

  useEffect(() => {
    if (Number(day) > dayCount) setDay(String(dayCount).padStart(2, '0'));
  }, [day, dayCount]);

  const applyJump = () => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    if (
      !Number.isInteger(numericYear) ||
      numericYear < 1 ||
      numericYear > 9999 ||
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12 ||
      !Number.isInteger(numericDay) ||
      numericDay < 1 ||
      numericDay > dayCount
    ) {
      setJumpError('请输入有效的年月日');
      return;
    }
    const next = `${String(numericYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`;
    if ((min && next < min) || (max && next > max)) {
      setJumpError('这个日期超出了当前可选范围');
      return;
    }
    setJumpError('');
    onChange(next);
  };

  return (
    <div className="field date-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <small>{hint}</small>}
      <details className="date-jump">
        <summary>
          <CalendarRange size={14} />
          按年份快速定位
        </summary>
        <div className="date-jump-controls">
          <label>
            <span>年</span>
            <input
              aria-label={`${label}年份`}
              type="number"
              inputMode="numeric"
              min="1"
              max="9999"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
          <label>
            <span>月</span>
            <select
              aria-label={`${label}月份`}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {Array.from({ length: 12 }, (_, index) => {
                const option = String(index + 1).padStart(2, '0');
                return (
                  <option value={option} key={option}>
                    {index + 1} 月
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span>日</span>
            <select
              aria-label={`${label}日期`}
              value={day}
              onChange={(event) => setDay(event.target.value)}
            >
              {Array.from({ length: dayCount }, (_, index) => {
                const option = String(index + 1).padStart(2, '0');
                return (
                  <option value={option} key={option}>
                    {index + 1} 日
                  </option>
                );
              })}
            </select>
          </label>
          <button className="button secondary" type="button" onClick={applyJump}>
            使用这个日期
          </button>
        </div>
        {jumpError && <small className="field-error">{jumpError}</small>}
      </details>
    </div>
  );
}

export function formatDate(date?: string | null) {
  if (!date) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(date.length === 10 ? `${date}T00:00:00Z` : date),
  );
}

export function formatMoney(amount: string | null, currency: string | null, digits = 2) {
  if (amount == null || !currency) return '未记录价值';
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: Math.max(digits, 4),
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}
