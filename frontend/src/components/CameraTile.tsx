import clsx from 'clsx';
import {
  Camera as CameraIcon,
  Circle,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Camera } from '../lib/types';
import { StatusDot } from './ui';
import HlsPlayer from './HlsPlayer';

/**
 * A live-wall tile: HLS video + camera name/status overlay, REC indicator,
 * digital zoom (wheel / buttons / drag-pan), fullscreen and snapshot capture.
 */
export default function CameraTile({
  camera,
  large,
  onSelectCamera,
  selectable,
  cameras,
}: {
  camera: Camera | null;
  large?: boolean;
  selectable?: boolean;
  cameras?: Camera[];
  onSelectCamera?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const limit = ((z - 1) / 2) * 100;
    return {
      x: Math.max(-limit, Math.min(limit, p.x)),
      y: Math.max(-limit, Math.min(limit, p.y)),
    };
  }, []);

  const applyZoom = useCallback(
    (dz: number) => {
      setZoom((z) => {
        const nz = Math.max(1, Math.min(6, +(z + dz).toFixed(2)));
        setPan((p) => clampPan(p, nz));
        return nz;
      });
    },
    [clampPan],
  );

  const onWheel = (e: React.WheelEvent) => {
    if (!camera) return;
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? 0.4 : -0.4);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragging.current.y) / rect.height) * 100;
    dragging.current = { x: e.clientX, y: e.clientY };
    setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }, zoom));
  };
  const onMouseUp = () => (dragging.current = null);

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  };

  const snapshot = async () => {
    if (!camera) return;
    try {
      const r = await api.post(`/snapshots/${camera.id}`);
      const resp = await fetch(r.data.url, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${localStorage.getItem('vms_token') ?? ''}` },
      });
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${camera.name.replaceAll(' ', '_')}_${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
      setSnapMsg('Snapshot saved');
    } catch {
      setSnapMsg('Snapshot failed');
    }
    setTimeout(() => setSnapMsg(null), 2500);
  };

  return (
    <div
      ref={containerRef}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-surface-700/70 bg-black"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {camera ? (
        <>
          <div className="relative flex-1 overflow-hidden">
            <div
              className="h-full w-full transition-transform duration-75"
              style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}%, ${pan.y / zoom}%)` }}
            >
              {camera.status === 'ONLINE' || camera.isEnabled ? (
                <HlsPlayer
                  src={camera.hlsUrl ?? `/media/live/${camera.id}/index.m3u8`}
                  className="h-full w-full object-contain"
                  videoRef={videoRef}
                />
              ) : null}
            </div>
            {camera.status !== 'ONLINE' && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70">
                <CameraIcon size={large ? 34 : 22} className="text-slate-600" />
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {camera.status === 'DISABLED' ? 'Disabled' : 'Offline'}
                </p>
              </div>
            )}

            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <StatusDot status={camera.status} />
                <span className="truncate text-[12px] font-semibold text-white drop-shadow">
                  {camera.name}
                </span>
              </div>
              {camera.isRecording && (
                <span className="flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <Circle size={7} className="animate-pulse fill-white" /> REC
                </span>
              )}
            </div>

            {zoom > 1 && (
              <span className="absolute left-2 top-8 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {zoom.toFixed(1)}×
              </span>
            )}
            {snapMsg && (
              <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-[11px] font-medium text-emerald-300">
                {snapMsg}
              </span>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
              <TileBtn title="Zoom in" onClick={() => applyZoom(0.5)}>
                <ZoomIn size={14} />
              </TileBtn>
              <TileBtn title="Zoom out" onClick={() => applyZoom(-0.5)}>
                <ZoomOut size={14} />
              </TileBtn>
              {zoom > 1 && (
                <TileBtn
                  title="Reset zoom"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <RotateCcw size={14} />
                </TileBtn>
              )}
              <TileBtn title="Snapshot" onClick={snapshot}>
                <CameraIcon size={14} />
              </TileBtn>
              <TileBtn title="Fullscreen" onClick={fullscreen}>
                <Maximize2 size={14} />
              </TileBtn>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs uppercase tracking-widest text-slate-600">No camera</p>
        </div>
      )}

      {selectable && cameras && (
        <select
          className="absolute bottom-1.5 left-1.5 z-10 max-w-[55%] rounded border border-surface-600 bg-black/70 px-1 py-0.5 text-[11px] text-slate-300 opacity-0 outline-none transition group-hover:opacity-100"
          value={camera?.id ?? ''}
          onChange={(e) => onSelectCamera?.(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <option value="">— none —</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TileBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="rounded bg-black/50 p-1.5 text-slate-200 transition hover:bg-accent/30 hover:text-white"
    >
      {children}
    </button>
  );
}
