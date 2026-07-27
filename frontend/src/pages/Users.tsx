import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo } from '../lib/format';
import type { Camera, Role, User } from '../lib/types';

interface UserForm {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: Role;
  isActive: boolean;
}

const EMPTY_FORM: UserForm = {
  username: '',
  email: '',
  fullName: '',
  password: '',
  role: 'VIEWER',
  isActive: true,
};

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [assigning, setAssigning] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', q],
    queryFn: async () => (await api.get<User[]>('/users', { params: { q: q || undefined } })).data,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Manage accounts, roles and per-viewer camera access"
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Add User
          </button>
        }
      />

      <input
        className="input mb-3 max-w-xs"
        placeholder="Search username, name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && (
        <p
          className="mb-3 cursor-pointer rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          onClick={() => setError(null)}
        >
          {error} (click to dismiss)
        </p>
      )}

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-surface-700/60">
                <th className="th">User</th>
                <th className="th">Email</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Last Login</th>
                <th className="th">Camera Access</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-850/50">
                  <td className="td">
                    <p className="font-medium text-slate-200">{u.fullName}</p>
                    <p className="font-mono text-xs text-slate-500">{u.username}</p>
                  </td>
                  <td className="td text-sm text-slate-400">{u.email}</td>
                  <td className="td">
                    <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {u.role}
                    </span>
                  </td>
                  <td className="td">
                    <StatusBadge status={u.isActive ? 'ONLINE' : 'DISABLED'} />
                  </td>
                  <td className="td text-xs text-slate-400">{fmtAgo(u.lastLoginAt)}</td>
                  <td className="td text-xs text-slate-400">
                    {u.role === 'VIEWER' ? (
                      <button
                        className="flex items-center gap-1 text-accent hover:underline"
                        onClick={() => setAssigning(u)}
                      >
                        <Video size={12} /> {u.assignedCameras?.length ?? 0} camera(s)
                      </button>
                    ) : (
                      <span className="text-slate-600">full access</span>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        title="Edit"
                        className="rounded p-1.5 text-slate-400 transition hover:bg-surface-700 hover:text-white"
                        onClick={() => setEditing(u)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        title="Delete"
                        disabled={u.id === me?.id}
                        className="rounded p-1.5 text-slate-400 transition hover:bg-surface-700 hover:text-white disabled:opacity-30"
                        onClick={() => {
                          if (confirm(`Delete user "${u.username}"?`)) del.mutate(u.id);
                        }}
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
      {assigning && (
        <AssignCamerasModal
          user={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<UserForm>(
    user
      ? {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          password: '',
          role: user.role,
          isActive: user.isActive,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<UserForm> = { ...form };
      if (user && !form.password) delete payload.password;
      if (user) await api.put(`/users/${user.id}`, payload);
      else await api.post('/users', payload);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={user ? `Edit ${user.username}` : 'Add User'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              disabled={!!user}
              required
            />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{user ? 'New Password (optional)' : 'Password'}</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={user ? 'Leave blank to keep current' : 'min 8 characters'}
              required={!user}
              minLength={8}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              <option value="ADMIN">Administrator</option>
              <option value="OPERATOR">Operator</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 accent-sky-500"
          />
          <span className="text-sm text-slate-300">Account active</span>
        </label>
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssignCamerasModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => (await api.get<Camera[]>('/cameras')).data,
  });
  const [selected, setSelected] = useState<Set<string>>(
    new Set(user.assignedCameras?.map((c) => c.id) ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/users/${user.id}/cameras`, { cameraIds: [...selected] });
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Camera access — ${user.username}`} onClose={onClose}>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {cameras.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-850"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="h-4 w-4 accent-sky-500"
            />
            <div>
              <p className="text-sm text-slate-200">{c.name}</p>
              <p className="text-xs text-slate-500">{c.location}</p>
            </div>
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : `Save (${selected.size} selected)`}
        </button>
      </div>
    </Modal>
  );
}
