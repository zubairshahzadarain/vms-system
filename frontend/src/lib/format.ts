import { format, formatDistanceToNowStrict } from 'date-fns';

export function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), 'dd MMM yyyy HH:mm:ss');
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), 'HH:mm:ss');
}

export function fmtAgo(iso?: string | null): string {
  if (!iso) return 'never';
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}
