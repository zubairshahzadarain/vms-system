import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import CameraTile from '../components/CameraTile';
import { PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { Camera } from '../lib/types';

const LAYOUTS = [1, 4, 9, 16] as const;

export default function LiveView() {
  const qc = useQueryClient();
  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
    refetchInterval: 30_000,
  });

  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>(4);
  const [slots, setSlots] = useState<(string | null)[]>([]);

  useEffect(() => {
    setSlots((prev) => {
      const next = [...prev].slice(0, layout);
      while (next.length < layout) next.push(null);
      const used = new Set(next.filter(Boolean));
      const available = cameras.filter((c) => c.isEnabled && !used.has(c.id));
      for (let i = 0; i < next.length; i++) {
        if (!next[i] && available.length) next[i] = available.shift()!.id;
      }
      return next;
    });
  }, [cameras, layout]);

  useEffect(() => {
    const socket = getSocket();
    const onStatus = () => void qc.invalidateQueries({ queryKey: ['cameras'] });
    socket.on('camera.status', onStatus);
    socket.on('recording.status', onStatus);
    return () => {
      socket.off('camera.status', onStatus);
      socket.off('recording.status', onStatus);
    };
  }, [qc]);

  const byId = useMemo(() => new Map(cameras.map((c) => [c.id, c])), [cameras]);

  const gridCls =
    layout === 1
      ? 'grid-cols-1'
      : layout === 4
        ? 'grid-cols-2'
        : layout === 9
          ? 'grid-cols-3'
          : 'grid-cols-4';

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Live View"
        subtitle={`${cameras.filter((c) => c.status === 'ONLINE').length} of ${cameras.length} cameras online`}
        actions={
          <div className="flex overflow-hidden rounded-lg border border-surface-600">
            {LAYOUTS.map((n) => (
              <button
                key={n}
                onClick={() => setLayout(n)}
                className={clsx(
                  'px-3 py-1.5 text-sm font-semibold transition',
                  layout === n
                    ? 'bg-accent/20 text-accent'
                    : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200',
                )}
              >
                {n === 1 ? '1×1' : n === 4 ? '2×2' : n === 9 ? '3×3' : '4×4'}
              </button>
            ))}
          </div>
        }
      />

      <div
        className={clsx('grid flex-1 gap-2', gridCls)}
        style={{ gridAutoRows: 'minmax(0, 1fr)' }}
      >
        {slots.map((cameraId, i) => (
          <CameraTile
            key={`${i}-${cameraId ?? 'empty'}`}
            camera={cameraId ? (byId.get(cameraId) ?? null) : null}
            cameras={cameras.filter((c) => c.isEnabled)}
            selectable
            large={layout === 1}
            onSelectCamera={(id) =>
              setSlots((prev) => {
                const next = [...prev];
                next[i] = id || null;
                return next;
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
