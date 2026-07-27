import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, HardDrive, Radio, Users, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import CameraTile from '../components/CameraTile';
import { SeverityBadge } from '../components/ui';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { fmtAgo, fmtBytes, fmtTime } from '../lib/format';
import type { Camera, DashboardStats, VmsEvent } from '../lib/types';

/** Security-operations wall: multi-camera view + real-time incident rail. */
export default function CommandCenter() {
  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
    refetchInterval: 30_000,
  });
  const { data: initialStats } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/dashboard')).data,
    refetchInterval: 20_000,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [feed, setFeed] = useState<VmsEvent[]>([]);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (initialStats) {
      setStats((s) => s ?? initialStats);
      setFeed((f) => (f.length ? f : initialStats.recentEvents));
    }
  }, [initialStats]);

  useEffect(() => {
    const socket = getSocket();
    const onStats = (s: DashboardStats) => setStats(s);
    const onEvent = (e: VmsEvent) => setFeed((f) => [e, ...f].slice(0, 60));
    socket.on('dashboard.stats', onStats);
    socket.on('event.new', onEvent);
    return () => {
      socket.off('dashboard.stats', onStats);
      socket.off('event.new', onEvent);
    };
  }, []);

  const s = stats ?? initialStats;
  const wall = useMemo(() => cameras.filter((c) => c.isEnabled).slice(0, 9), [cameras]);
  const cols = wall.length <= 1 ? 1 : wall.length <= 4 ? 2 : 3;
  const offline = s?.cameraHealth.filter((c) => c.status === 'OFFLINE' && c.isEnabled) ?? [];
  const alarms = feed.filter((e) => e.severity !== 'INFO' && e.status === 'OPEN').slice(0, 8);
  const failures = feed.filter((e) => e.type === 'RECORDING_FAILURE').slice(0, 5);
  const storagePct = s ? Math.min(100, s.storage.usedPercentOfQuota) : 0;

  return (
    <div className="-m-5 flex h-[calc(100vh)] flex-col bg-surface-950">
      <div className="flex items-center justify-between border-b border-surface-700/60 bg-surface-900 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Radio size={18} className="animate-pulse text-red-400" />
          <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-white">
            Central Command Center
          </h1>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-400">
          <span>
            <span className="font-bold text-emerald-300">{s?.cameras.online ?? '–'}</span> online
          </span>
          <span>
            <span className={clsx('font-bold', offline.length ? 'text-red-300' : 'text-slate-300')}>
              {offline.length}
            </span>{' '}
            offline
          </span>
          <span>
            <span className="font-bold text-red-300">{s?.events.openCritical ?? 0}</span> critical
          </span>
          <span className="font-mono text-sm text-accent">{clock.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1fr_320px]">
        <div
          className={clsx('grid h-full gap-1.5 overflow-hidden p-2', {
            'grid-cols-1': cols === 1,
            'grid-cols-2': cols === 2,
            'grid-cols-3': cols === 3,
          })}
          style={{ gridAutoRows: 'minmax(0, 1fr)' }}
        >
          {wall.length === 0 && (
            <div className="flex items-center justify-center text-sm text-slate-500">
              No enabled cameras
            </div>
          )}
          {wall.map((cam) => (
            <CameraTile key={cam.id} camera={cam} />
          ))}
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto border-l border-surface-700/60 bg-surface-900/60 p-2">
          <RailSection
            icon={<AlertTriangle size={13} className="text-red-400" />}
            title={`Active Alarms (${alarms.length})`}
          >
            {alarms.length === 0 && <RailEmpty text="No active alarms" />}
            {alarms.map((e) => (
              <div key={e.id} className="rounded-md border-l-2 border-red-500/70 bg-surface-850 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <SeverityBadge severity={e.severity} />
                  <span className="text-[10px] text-slate-500">{fmtTime(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-slate-300">{e.description}</p>
              </div>
            ))}
          </RailSection>

          <RailSection
            icon={<WifiOff size={13} className="text-amber-400" />}
            title={`Offline Cameras (${offline.length})`}
          >
            {offline.length === 0 && <RailEmpty text="All cameras online" />}
            {offline.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md bg-surface-850 px-2 py-1.5">
                <div>
                  <p className="text-[12px] font-medium text-slate-200">{c.name}</p>
                  <p className="text-[10px] text-slate-500">{c.location}</p>
                </div>
                <span className="text-[10px] text-red-300">{fmtAgo(c.lastHeartbeat)}</span>
              </div>
            ))}
            {failures.length > 0 && (
              <p className="px-1 pt-1 text-[10px] font-semibold uppercase text-red-400">
                {failures.length} recording failure(s) — see feed
              </p>
            )}
          </RailSection>

          <RailSection icon={<HardDrive size={13} className="text-accent" />} title="Storage Health">
            <div className="rounded-md bg-surface-850 px-2 py-2">
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>{s ? fmtBytes(s.storage.usedBytes) : '–'}</span>
                <span>{storagePct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
                <div
                  className={clsx(
                    'h-full transition-all',
                    storagePct > 90 ? 'bg-red-500' : storagePct > 75 ? 'bg-amber-400' : 'bg-emerald-400',
                  )}
                  style={{ width: `${storagePct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {s ? `${fmtBytes(s.storage.diskFreeBytes)} disk free` : ''}
              </p>
            </div>
          </RailSection>

          <RailSection
            icon={<Users size={13} className="text-emerald-300" />}
            title={`Operators Online (${s?.activeUsers.length ?? 0})`}
          >
            {(s?.activeUsers ?? []).map((u) => (
              <div key={u.userId} className="flex items-center gap-2 rounded-md bg-surface-850 px-2 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <p className="text-[12px] text-slate-300">
                  {u.fullName} <span className="text-slate-500">({u.role.toLowerCase()})</span>
                </p>
              </div>
            ))}
          </RailSection>

          <RailSection icon={<Radio size={13} className="text-accent" />} title="Live Event Feed">
            {feed.slice(0, 25).map((e) => (
              <div key={e.id} className="rounded-md bg-surface-850 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {e.type.replaceAll('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">{fmtTime(e.createdAt)}</span>
                </div>
                <p className="text-[12px] leading-snug text-slate-300">{e.description}</p>
              </div>
            ))}
          </RailSection>
        </div>
      </div>
    </div>
  );
}

function RailSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        {icon}
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RailEmpty({ text }: { text: string }) {
  return <p className="rounded-md bg-surface-850 px-2 py-1.5 text-[11px] text-slate-500">{text}</p>;
}
