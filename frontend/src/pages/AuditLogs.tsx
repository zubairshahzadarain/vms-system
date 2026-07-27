import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, PageHeader, Pagination, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import type { AuditLog, Paged } from '../lib/types';

const RESOURCES = [
  'auth',
  'cameras',
  'recordings',
  'snapshots',
  'events',
  'users',
  'search',
];

const ACTION_COLOR = (action: string) => {
  if (action.startsWith('DELETE')) return 'text-red-300';
  if (action.startsWith('POST')) return 'text-emerald-300';
  if (action.startsWith('PUT') || action.startsWith('PATCH')) return 'text-amber-300';
  return 'text-slate-300';
};

export default function AuditLogs() {
  const [resource, setResource] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', resource, q, from, to, page],
    queryFn: async () =>
      (
        await api.get<Paged<AuditLog>>('/audit', {
          params: {
            resource: resource || undefined,
            q: q || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
            page,
            pageSize: 30,
          },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Record of important user activity across the system" />

      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input
          className="input"
          placeholder="Search action…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="input"
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All resources</option>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          className="input"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="datetime-local"
          className="input"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No audit entries match the filters" />
        ) : (
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-surface-700/60">
                <th className="th">Time</th>
                <th className="th">User</th>
                <th className="th">Action</th>
                <th className="th">Resource</th>
                <th className="th">IP</th>
                <th className="th">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {data.items.map((log) => (
                <tr key={log.id} className="hover:bg-surface-850/50">
                  <td className="td whitespace-nowrap text-xs text-slate-400">
                    {fmtDateTime(log.createdAt)}
                  </td>
                  <td className="td text-sm text-slate-300">
                    {log.user ? (
                      <>
                        <p className="font-medium">{log.user.username}</p>
                        <p className="text-[10px] uppercase text-slate-500">{log.user.role}</p>
                      </>
                    ) : (
                      <span className="text-slate-600">system</span>
                    )}
                  </td>
                  <td className={`td font-mono text-xs ${ACTION_COLOR(log.action)}`}>{log.action}</td>
                  <td className="td text-xs uppercase tracking-wide text-slate-400">{log.resource}</td>
                  <td className="td font-mono text-xs text-slate-500">{log.ip ?? '—'}</td>
                  <td className="td max-w-xs">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <code className="block truncate text-[11px] text-slate-500">
                        {JSON.stringify(log.details)}
                      </code>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
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
