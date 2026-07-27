import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Camera,
  Clock,
  Database,
  HardDrive,
  MonitorPlay,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { fmtAgo, fmtBytes, fmtDuration, fmtTime } from '../lib/format';
import type { DashboardStats } from '../lib/types';
import { PageHeader, SeverityBadge, Spinner, StatusBadge, StatusDot } from '../components/ui';

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-red-300'
          : 'text-white';
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`text-lg font-bold leading-tight ${toneCls}`}>{value}</p>
        {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: initial, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/dashboard')).data,
    refetchInterval: 15_000,
  });
  const [live, setLive] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onStats = (s: DashboardStats) => setLive(s);
    socket.on('dashboard.stats', onStats);
    return () => {
      socket.off('dashboard.stats', onStats);
    };
  }, []);

  const stats = live ?? initial;
  if (isLoading && !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!stats) return null;

  const storagePct = Math.min(100, stats.storage.usedPercentOfQuota);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`System overview · auto-refreshing · ${fmtTime(stats.system.now)}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard icon={<Camera size={18} />} label="Total Cameras" value={stats.cameras.total} />
        <StatCard
          icon={<Activity size={18} />}
          label="Online"
          value={stats.cameras.online}
          tone="ok"
          sub={`${stats.cameras.offline} offline · ${stats.cameras.disabled} disabled`}
        />
        <StatCard
          icon={<MonitorPlay size={18} />}
          label="Live Streams"
          value={stats.activeLiveStreams}
        />
        <StatCard
          icon={<Video size={18} />}
          label="Recording"
          value={stats.activeRecordings.length}
          tone={stats.activeRecordings.length ? 'ok' : undefined}
          sub={`${stats.recordingsToday.segments} segments today`}
        />
        <StatCard
          icon={<HardDrive size={18} />}
          label="Storage Used"
          value={fmtBytes(stats.storage.usedBytes)}
          tone={storagePct > 90 ? 'bad' : storagePct > 75 ? 'warn' : undefined}
          sub={`${storagePct}% of quota`}
        />
        <StatCard
          icon={<Database size={18} />}
          label="Disk Free"
          value={fmtBytes(stats.storage.diskFreeBytes)}
        />
        <StatCard
          icon={<Users size={18} />}
          label="Active Users"
          value={stats.activeUsers.length}
          sub={stats.activeUsers.map((u) => u.username).join(', ') || '—'}
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Uptime"
          value={fmtDuration(stats.system.uptimeSeconds)}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="border-b border-surface-700/60 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Camera Health</h2>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-900">
                <tr className="border-b border-surface-700/60">
                  <th className="th">Camera</th>
                  <th className="th">Status</th>
                  <th className="th">Recording</th>
                  <th className="th">Heartbeat</th>
                  <th className="th">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {stats.cameraHealth.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-850/50">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <StatusDot status={c.status} />
                        <div>
                          <p className="font-medium text-slate-200">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="td">
                      {c.isRecording ? (
                        <span className="text-xs font-semibold text-red-300">
                          ● {c.recordingType}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="td text-xs text-slate-400">{fmtAgo(c.lastHeartbeat)}</td>
                    <td className="td text-xs text-slate-400">
                      {c.resolution} @ {c.fps}fps
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Storage</h2>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{fmtBytes(stats.storage.usedBytes)} used</span>
              <span>quota {fmtBytes(stats.storage.quotaBytes)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-700">
              <div
                className={`h-full rounded-full transition-all ${
                  storagePct > 90 ? 'bg-red-500' : storagePct > 75 ? 'bg-amber-400' : 'bg-accent'
                }`}
                style={{ width: `${storagePct}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
              {Object.entries(stats.storage.byCategory).map(([k, v]) => (
                <div key={k} className="flex justify-between rounded bg-surface-850 px-2 py-1">
                  <span className="capitalize">{k}</span>
                  <span className="font-mono">{fmtBytes(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-700/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Recent Events</h2>
              <Link to="/events" className="text-xs text-accent hover:underline">
                View all
              </Link>
            </div>
            <div className="max-h-72 divide-y divide-surface-800 overflow-y-auto">
              {stats.recentEvents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No events yet</p>
              )}
              {stats.recentEvents.map((e) => (
                <div key={e.id} className="flex items-start gap-2 px-4 py-2.5">
                  <SeverityBadge severity={e.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-slate-300">{e.description}</p>
                    <p className="text-[11px] text-slate-500">
                      {e.camera?.name ? `${e.camera.name} · ` : ''}
                      {fmtTime(e.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
