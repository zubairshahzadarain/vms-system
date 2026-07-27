import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { CameraStatus, Severity } from '../lib/types';

export function StatusDot({ status }: { status: CameraStatus | string }) {
  const color =
    status === 'ONLINE'
      ? 'bg-emerald-400 shadow-emerald-400/50'
      : status === 'OFFLINE'
        ? 'bg-red-500 shadow-red-500/50'
        : 'bg-slate-500 shadow-slate-500/40';
  return <span className={clsx('inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px]', color)} />;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ONLINE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    OFFLINE: 'bg-red-500/15 text-red-300 border-red-500/30',
    DISABLED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    OPEN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    COMPLETED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        styles[status] ?? 'bg-surface-700 text-slate-300 border-surface-600',
      )}
    >
      {status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    INFO: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    WARNING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    CRITICAL: 'bg-red-500/15 text-red-300 border-red-500/30',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        styles[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-accent',
        className,
      )}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={clsx('card max-h-[90vh] w-full overflow-y-auto p-5', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
      <span>
        Page {page} of {pages} · {total} items
      </span>
      <div className="flex gap-2">
        <button className="btn-ghost px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <button
          className="btn-ghost px-2 py-1"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
