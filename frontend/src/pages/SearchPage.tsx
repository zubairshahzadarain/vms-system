import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, PageHeader, SeverityBadge, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtBytes, fmtDateTime, fmtDuration } from '../lib/format';
import type { Camera, CameraGroup, Recording, User, VmsEvent } from '../lib/types';

interface SearchResult {
  cameras?: Camera[];
  recordings?: Recording[];
  events?: VmsEvent[];
  users?: User[];
}

export default function SearchPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['camera-groups'],
    queryFn: async () => (await api.get<CameraGroup[]>('/cameras/groups')).data,
  });

  const enabled = submitted.length > 0 || !!cameraId || !!groupId || !!status || !!eventType || !!from || !!to;
  const { data, isFetching } = useQuery({
    queryKey: ['search', submitted, cameraId, groupId, status, eventType, from, to],
    enabled,
    queryFn: async () =>
      (
        await api.get<SearchResult>('/search', {
          params: {
            q: submitted || undefined,
            cameraId: cameraId || undefined,
            groupId: groupId || undefined,
            status: status || undefined,
            eventType: eventType || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
            limit: 25,
          },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader title="Search" subtitle="Find cameras, recordings, events and users" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q);
        }}
        className="mb-4 space-y-2"
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search everything… (camera names, event descriptions, filenames, users)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <button className="btn-primary">Search</button>
        </div>
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <select className="input" value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
            <option value="">Any camera</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Any group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="DISABLED">Disabled</option>
            <option value="OPEN">Open (events)</option>
            <option value="CLOSED">Closed (events)</option>
          </select>
          <select className="input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="">Any event type</option>
            {[
              'CAMERA_OFFLINE',
              'CAMERA_RECONNECTED',
              'MOTION_DETECTED',
              'RECORDING_STARTED',
              'RECORDING_STOPPED',
              'RECORDING_FAILURE',
              'STORAGE_FULL',
              'USER_LOGIN',
              'USER_LOGOUT',
            ].map((t) => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </form>

      {!enabled ? (
        <EmptyState title="Type a query or set a filter to search" />
      ) : isFetching ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {!!data?.cameras?.length && (
            <ResultSection title={`Cameras (${data.cameras.length})`}>
              <table className="w-full">
                <tbody className="divide-y divide-surface-800">
                  {data.cameras.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-850/50">
                      <td className="td font-medium text-slate-200">{c.name}</td>
                      <td className="td text-sm text-slate-400">{c.location}</td>
                      <td className="td text-sm text-slate-400">{c.group?.name ?? '—'}</td>
                      <td className="td">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultSection>
          )}

          {!!data?.recordings?.length && (
            <ResultSection title={`Recordings (${data.recordings.length})`}>
              <table className="w-full">
                <tbody className="divide-y divide-surface-800">
                  {data.recordings.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-850/50">
                      <td className="td text-sm text-slate-200">{r.camera?.name}</td>
                      <td className="td text-xs text-slate-400">{fmtDateTime(r.startedAt)}</td>
                      <td className="td text-xs text-slate-400">{fmtDuration(r.duration)}</td>
                      <td className="td text-xs text-slate-400">{fmtBytes(Number(r.fileSize))}</td>
                      <td className="td text-xs font-semibold text-slate-300">{r.type}</td>
                      <td className="td text-right">
                        <a
                          className="text-xs text-accent hover:underline"
                          href={`/api/recordings/${r.id}/download`}
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultSection>
          )}

          {!!data?.events?.length && (
            <ResultSection title={`Events (${data.events.length})`}>
              <table className="w-full">
                <tbody className="divide-y divide-surface-800">
                  {data.events.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-850/50">
                      <td className="td text-xs text-slate-400">{fmtDateTime(e.createdAt)}</td>
                      <td className="td">
                        <SeverityBadge severity={e.severity} />
                      </td>
                      <td className="td text-sm text-slate-300">{e.description}</td>
                      <td className="td">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultSection>
          )}

          {!!data?.users?.length && user?.role === 'ADMIN' && (
            <ResultSection title={`Users (${data.users.length})`}>
              <table className="w-full">
                <tbody className="divide-y divide-surface-800">
                  {data.users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-850/50">
                      <td className="td font-mono text-sm text-slate-200">{u.username}</td>
                      <td className="td text-sm text-slate-400">{u.fullName}</td>
                      <td className="td text-sm text-slate-400">{u.email}</td>
                      <td className="td text-xs font-semibold text-accent">{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultSection>
          )}

          {data &&
            !data.cameras?.length &&
            !data.recordings?.length &&
            !data.events?.length &&
            !data.users?.length && <EmptyState title="No results found" />}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-700/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
