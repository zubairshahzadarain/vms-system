import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Camera as CameraIcon,
  Download,
  FastForward,
  FileDown,
  Pause,
  Play,
  Rewind,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { fmtBytes, fmtClock, fmtDateTime, fmtDuration, fmtTime } from '../lib/format';
import type { Camera, Paged, RecordingSession } from '../lib/types';

const SPEEDS = [0.5, 1, 2, 4];

export default function Playback() {
  const [cameraId, setCameraId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
  });

  const from = date ? `${date}T00:00:00.000Z` : undefined;
  const to = date ? `${date}T23:59:59.999Z` : undefined;
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', cameraId, date, type],
    queryFn: async () =>
      (
        await api.get<Paged<RecordingSession>>('/recordings/sessions', {
          params: {
            cameraId: cameraId || undefined,
            type: type || undefined,
            from,
            to,
            pageSize: 50,
          },
        })
      ).data,
    refetchInterval: 15_000,
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Playback" subtitle="Browse and replay recorded video" />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_1fr]">
        <div className="card flex min-h-0 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-surface-700/60 p-3">
            <select className="input" value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
              <option value="">All cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                <option value="CONTINUOUS">Continuous</option>
                <option value="MANUAL">Manual</option>
                <option value="EVENT">Event</option>
              </select>
            </div>
          </div>
          <div className="flex-1 divide-y divide-surface-800 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !sessions?.items.length ? (
              <EmptyState title="No recordings" hint="Try another camera or date" />
            ) : (
              sessions.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={clsx(
                    'block w-full px-3 py-2.5 text-left transition hover:bg-surface-850',
                    selected === s.id && 'bg-accent/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-200">{s.camera?.name}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtDateTime(s.startedAt)} · {fmtDuration(s.totalDuration ?? 0)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {s.type} · {s._count?.recordings ?? 0} segments · {fmtBytes(s.totalBytes ?? 0)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col">
          {selected ? (
            <SessionPlayer sessionId={selected} />
          ) : (
            <div className="card flex flex-1 items-center justify-center">
              <EmptyState title="Select a recording session" hint="Choose from the list on the left" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionPlayer({ sessionId }: { sessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [globalTime, setGlobalTime] = useState(0);
  const pendingSeek = useRef<number | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => (await api.get<RecordingSession>(`/recordings/sessions/${sessionId}`)).data,
  });

  const segments = session?.recordings ?? [];
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const r of segments) {
      out.push(acc);
      acc += r.duration;
    }
    return out;
  }, [segments]);
  const totalDuration = useMemo(
    () => segments.reduce((a, r) => a + r.duration, 0),
    [segments],
  );
  const keyframes = useMemo(
    () =>
      segments.flatMap((r, i) =>
        (r.keyframes ?? []).map((k) => ({
          ...k,
          globalT:
            offsets[i] + Math.max(0, (new Date(k.timestamp).getTime() - new Date(r.startedAt).getTime()) / 1000),
        })),
      ),
    [segments, offsets],
  );

  useEffect(() => {
    setIdx(0);
    setGlobalTime(0);
    setPlaying(false);
    pendingSeek.current = null;
  }, [sessionId]);

  const current = segments[idx];

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed, idx]);

  const seekGlobal = (t: number) => {
    const clamped = Math.max(0, Math.min(totalDuration - 0.2, t));
    let target = 0;
    for (let i = 0; i < segments.length; i++) {
      if (clamped >= offsets[i] && clamped < offsets[i] + segments[i].duration + 0.001) {
        target = i;
        break;
      }
      target = i;
    }
    const offset = clamped - offsets[target];
    if (target === idx && videoRef.current) {
      videoRef.current.currentTime = offset;
    } else {
      pendingSeek.current = offset;
      setIdx(target);
    }
    setGlobalTime(clamped);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  if (!session) {
    return (
      <div className="card flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!segments.length) {
    return (
      <div className="card flex flex-1 items-center justify-center">
        <EmptyState title="Session has no playable segments yet" hint="Segments appear as they are finalized" />
      </div>
    );
  }

  const snapshot = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${session.camera?.name ?? 'camera'}_${fmtClock(globalTime).replaceAll(':', '-')}.png`;
    a.click();
  };

  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-700/60 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-white">
            {session.camera?.name} — {session.type} session
          </p>
          <p className="text-xs text-slate-400">
            {fmtDateTime(session.startedAt)} · {segments.length} segments ·{' '}
            {fmtDuration(totalDuration)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-ghost px-2.5 py-1.5 text-xs"
            href={`/api/recordings/sessions/${session.id}/export`}
            title="Download whole session as one MP4"
          >
            <FileDown size={14} /> Export session
          </a>
          {current && (
            <a
              className="btn-ghost px-2.5 py-1.5 text-xs"
              href={`/api/recordings/${current.id}/download`}
              title="Download current segment"
            >
              <Download size={14} /> Segment
            </a>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          key={current.id}
          ref={videoRef}
          src={current.url}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay={playing}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v && pendingSeek.current != null) {
              v.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
            if (v) v.playbackRate = speed;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v && !v.seeking) setGlobalTime(offsets[idx] + v.currentTime);
          }}
          onEnded={() => {
            if (idx < segments.length - 1) {
              pendingSeek.current = 0;
              setIdx(idx + 1);
              setPlaying(true);
            } else {
              setPlaying(false);
            }
          }}
        />
        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-accent">
          {fmtClock(globalTime)} / {fmtClock(totalDuration)}
        </span>
      </div>

      <div className="border-t border-surface-700/60 px-4 pb-1 pt-3">
        <div
          className="relative h-6 cursor-pointer overflow-hidden rounded bg-surface-800"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekGlobal(((e.clientX - rect.left) / rect.width) * totalDuration);
          }}
        >
          {segments.map((r, i) => (
            <div
              key={r.id}
              title={`${fmtTime(r.startedAt)} (${fmtDuration(r.duration)})`}
              className={clsx(
                'absolute top-0 h-full border-r border-surface-950/70',
                r.type === 'EVENT' ? 'bg-amber-500/25' : 'bg-accent/15',
              )}
              style={{
                left: `${(offsets[i] / totalDuration) * 100}%`,
                width: `${(r.duration / totalDuration) * 100}%`,
              }}
            />
          ))}
          <div
            className="absolute top-0 h-full w-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]"
            style={{ left: `${Math.min(100, (globalTime / totalDuration) * 100)}%` }}
          />
        </div>

        {keyframes.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {keyframes.map((k) => (
              <button
                key={k.id}
                onClick={() => seekGlobal(k.globalT)}
                title={fmtTime(k.timestamp)}
                className={clsx(
                  'relative shrink-0 overflow-hidden rounded border transition',
                  Math.abs(k.globalT - globalTime) < 15
                    ? 'border-accent'
                    : 'border-surface-700 hover:border-slate-400',
                )}
              >
                <img src={k.url} alt="" className="h-14 w-24 object-cover" loading="lazy" />
                <span className="absolute bottom-0 right-0 bg-black/80 px-1 font-mono text-[9px] text-slate-300">
                  {fmtClock(k.globalT)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-surface-700/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost p-2" title="Back 10s" onClick={() => seekGlobal(globalTime - 10)}>
            <Rewind size={16} />
          </button>
          <button className="btn-primary p-2.5" onClick={togglePlay}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button className="btn-ghost p-2" title="Forward 10s" onClick={() => seekGlobal(globalTime + 10)}>
            <FastForward size={16} />
          </button>
          <button className="btn-ghost p-2" title="Snapshot current frame" onClick={snapshot}>
            <CameraIcon size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={clsx(
                'rounded px-2 py-1 text-xs font-semibold transition',
                speed === s
                  ? 'bg-accent/20 text-accent'
                  : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
