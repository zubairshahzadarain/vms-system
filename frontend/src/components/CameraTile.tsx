import clsx from 'clsx';
import {
  Camera as CameraIcon,
  Circle,
  Maximize2,
  RotateCcw,
  ScanEye,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { detectObjects, loadDetector, type Detection } from '../lib/detection';
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

  // Client-side AI object detection (TensorFlow.js, runs entirely in-browser —
  // no backend, no API key). Opt-in per tile: real-time inference on every
  // tile at once would be wasteful, so it only runs where explicitly enabled.
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);

  useEffect(() => {
    if (!aiEnabled || !camera) {
      setDetections([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const runLoop = async () => {
      setAiLoading(true);
      const model = await loadDetector().catch(() => null);
      setAiLoading(false);
      if (cancelled || !model) return;

      const tick = async () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video) {
          const found = await detectObjects(video, model).catch(() => []);
          if (!cancelled) setDetections(found);
        }
        timer = setTimeout(tick, 800);
      };
      void tick();
    };
    void runLoop();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aiEnabled, camera]);

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
              {aiEnabled &&
                detections.map((d, i) => {
                  const vw = videoRef.current?.videoWidth || 1;
                  const vh = videoRef.current?.videoHeight || 1;
                  const [x, y, w, h] = d.bbox;
                  return (
                    <div
                      key={i}
                      className="pointer-events-none absolute border-2 border-accent"
                      style={{
                        left: `${(x / vw) * 100}%`,
                        top: `${(y / vh) * 100}%`,
                        width: `${(w / vw) * 100}%`,
                        height: `${(h / vh) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 whitespace-nowrap rounded-sm bg-accent px-1 py-0.5 text-[10px] font-bold uppercase text-surface-950">
                        {d.class} {Math.round(d.score * 100)}%
                      </span>
                    </div>
                  );
                })}
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
              <div className="flex items-center gap-1">
                {aiEnabled && (
                  <span className="flex items-center gap-1 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-surface-950">
                    <ScanEye size={10} /> {aiLoading ? 'AI…' : `AI ${detections.length}`}
                  </span>
                )}
                {camera.isRecording && (
                  <span className="flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Circle size={7} className="animate-pulse fill-white" /> REC
                  </span>
                )}
              </div>
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
              <TileBtn
                title={aiEnabled ? 'Disable AI detection' : 'Enable AI object detection (runs in-browser)'}
                onClick={() => setAiEnabled((v) => !v)}
                active={aiEnabled}
              >
                <ScanEye size={14} />
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
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className={clsx(
        'rounded p-1.5 transition',
        active
          ? 'bg-accent/25 text-accent'
          : 'bg-black/50 text-slate-200 hover:bg-accent/30 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
