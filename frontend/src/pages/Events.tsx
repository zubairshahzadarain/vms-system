import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EmptyState,
  PageHeader,
  Pagination,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { fmtDateTime } from '../lib/format';
import type { Camera, Paged, VmsEvent } from '../lib/types';

const EVENT_TYPES = [
  'CAMERA_OFFLINE',
  'CAMERA_RECONNECTED',
  'MOTION_DETECTED',
  'RECORDING_STARTED',
  'RECORDING_STOPPED',
  'RECORDING_FAILURE',
  'STORAGE_FULL',
  'USER_LOGIN',
  'USER_LOGOUT',
];

export default function Events() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    type: '',
    severity: '',
    status: '',
    cameraId: '',
    from: '',
    to: '',
    q: '',
  });
  const [page, setPage] = useState(1);

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['events', filters, page],
    queryFn: async () =>
      (
        await api.get<Paged<VmsEvent>>('/events', {
          params: {
            ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
            from: filters.from ? new Date(filters.from).toISOString() : undefined,
            to: filters.to ? new Date(filters.to).toISOString() : undefined,
            page,
            pageSize: 25,
          },
        })
      ).data,
  });

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => void qc.invalidateQueries({ queryKey: ['events'] });
    socket.on('event.new', refresh);
    socket.on('event.updated', refresh);
    return () => {
      socket.off('event.new', refresh);
      socket.off('event.updated', refresh);
    };
  }, [qc]);

  const close = useMutation({
    mutationFn: (id: string) => api.post(`/events/${id}/close`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });

  const set = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Event Management" subtitle="System events, alarms and incidents" />

      <div className="mb-3 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
        <input
          className="input"
          placeholder="Search description…"
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <select className="input" value={filters.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">All types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filters.severity}
          onChange={(e) => set('severity', e.target.value)}
        >
          <option value="">All severities</option>
          <option value="INFO">Info</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <select
          className="input"
          value={filters.status}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">Any status</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          className="input"
          value={filters.cameraId}
          onChange={(e) => set('cameraId', e.target.value)}
        >
          <option value="">All cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          className="input"
          value={filters.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <input
          type="datetime-local"
          className="input"
          value={filters.to}
          onChange={(e) => set('to', e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No events match the filters" />
        ) : (
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-surface-700/60">
                <th className="th">Time</th>
                <th className="th">Type</th>
                <th className="th">Severity</th>
                <th className="th">Camera</th>
                <th className="th">Description</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {data.items.map((e) => (
                <tr key={e.id} className="hover:bg-surface-850/50">
                  <td className="td whitespace-nowrap text-xs text-slate-400">
                    {fmtDateTime(e.createdAt)}
                  </td>
                  <td className="td text-xs font-semibold text-slate-300">
                    {e.type.replaceAll('_', ' ')}
                  </td>
                  <td className="td">
                    <SeverityBadge severity={e.severity} />
                  </td>
                  <td className="td text-sm text-slate-300">{e.camera?.name ?? '—'}</td>
                  <td className="td max-w-md text-sm text-slate-300">{e.description}</td>
                  <td className="td">
                    <StatusBadge status={e.status} />
                    {e.status === 'CLOSED' && e.closedBy && (
                      <p className="mt-0.5 text-[10px] text-slate-500">by {e.closedBy.username}</p>
                    )}
                  </td>
                  <td className="td text-right">
                    {e.status === 'OPEN' && (
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => close.mutate(e.id)}
                      >
                        <CheckCircle2 size={13} /> Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      )}
    </div>
  );
}
