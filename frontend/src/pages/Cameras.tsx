import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Circle,
  Pencil,
  Plug,
  Plus,
  Power,
  Square,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Modal, PageHeader, StatusBadge, Spinner } from '../components/ui';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo } from '../lib/format';
import type { Camera, CameraGroup } from '../lib/types';

interface CameraForm {
  name: string;
  location: string;
  rtspUrl: string;
  groupId: string;
  resolution: string;
  fps: number;
  transcode: boolean;
  motionDetection: boolean;
  continuousRecording: boolean;
}

const EMPTY_FORM: CameraForm = {
  name: '',
  location: '',
  rtspUrl: '',
  groupId: '',
  resolution: '1280x720',
  fps: 15,
  transcode: false,
  motionDetection: true,
  continuousRecording: false,
};

export default function Cameras() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [editing, setEditing] = useState<Camera | 'new' | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras', q, groupFilter],
    queryFn: async () =>
      (
        await api.get<Camera[]>('/cameras', {
          params: { q: q || undefined, groupId: groupFilter || undefined },
        })
      ).data,
    refetchInterval: 10_000,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['camera-groups'],
    queryFn: async () => (await api.get<CameraGroup[]>('/cameras/groups')).data,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cameras'] });
    void qc.invalidateQueries({ queryKey: ['camera-groups'] });
  };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/cameras/${id}`),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: (cam: Camera) =>
      api.post(`/cameras/${cam.id}/${cam.isEnabled ? 'disable' : 'enable'}`),
    onSuccess: invalidate,
  });
  const record = useMutation({
    mutationFn: (cam: Camera) =>
      api.post(`/recordings/record/${cam.id}/${cam.isRecording ? 'stop' : 'start'}`),
    onSuccess: invalidate,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const test = async (cam: Camera) => {
    setTestResult((s) => ({ ...s, [cam.id]: '…testing' }));
    try {
      const r = await api.post(`/cameras/${cam.id}/test`, {});
      setTestResult((s) => ({
        ...s,
        [cam.id]: r.data.ok
          ? `✓ ${r.data.codec} ${r.data.width}x${r.data.height} @ ${r.data.fps}fps`
          : `✗ ${r.data.error}`,
      }));
    } catch (e) {
      setTestResult((s) => ({ ...s, [cam.id]: `✗ ${apiErrorMessage(e)}` }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Camera Management"
        subtitle="Add, edit and control IP cameras"
        actions={
          isAdmin && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add Camera
            </button>
          )
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name or location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-[200px]"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g._count?.cameras ?? 0})
            </option>
          ))}
        </select>
      </div>

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
        ) : cameras.length === 0 ? (
          <EmptyState title="No cameras found" hint="Add a camera to start monitoring" />
        ) : (
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-surface-700/60">
                <th className="th">Camera</th>
                <th className="th">RTSP URL</th>
                <th className="th">Group</th>
                <th className="th">Profile</th>
                <th className="th">Status</th>
                <th className="th">Recording</th>
                <th className="th">Heartbeat</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {cameras.map((cam) => (
                <tr key={cam.id} className="hover:bg-surface-850/50">
                  <td className="td">
                    <p className="font-medium text-slate-200">{cam.name}</p>
                    <p className="text-xs text-slate-500">{cam.location}</p>
                  </td>
                  <td className="td max-w-[220px]">
                    <p className="truncate font-mono text-xs text-slate-400">{cam.rtspUrl}</p>
                    {testResult[cam.id] && (
                      <p
                        className={`text-[11px] ${testResult[cam.id].startsWith('✓') ? 'text-emerald-300' : testResult[cam.id].startsWith('✗') ? 'text-red-300' : 'text-slate-400'}`}
                      >
                        {testResult[cam.id]}
                      </p>
                    )}
                  </td>
                  <td className="td text-sm text-slate-400">{cam.group?.name ?? '—'}</td>
                  <td className="td text-xs text-slate-400">
                    {cam.resolution} @ {cam.fps}fps
                    {cam.transcode && <span className="ml-1 text-accent">T</span>}
                  </td>
                  <td className="td">
                    <StatusBadge status={cam.status} />
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      {cam.isRecording ? (
                        <span className="text-xs font-semibold text-red-300">
                          ● {cam.recordingType}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {cam.continuousRecording ? 'auto' : 'off'}
                        </span>
                      )}
                      <button
                        title={cam.isRecording ? 'Stop recording' : 'Start manual recording'}
                        className="rounded p-1 text-slate-400 transition hover:bg-surface-700 hover:text-white disabled:opacity-40"
                        disabled={!cam.isEnabled || record.isPending}
                        onClick={() => record.mutate(cam)}
                      >
                        {cam.isRecording ? (
                          <Square size={14} className="text-red-400" />
                        ) : (
                          <Circle size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="td text-xs text-slate-400">{fmtAgo(cam.lastHeartbeat)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Test connection" onClick={() => test(cam)}>
                        <Plug size={15} />
                      </IconBtn>
                      {isAdmin && (
                        <>
                          <IconBtn
                            title={cam.isEnabled ? 'Disable' : 'Enable'}
                            onClick={() => toggle.mutate(cam)}
                          >
                            <Power
                              size={15}
                              className={cam.isEnabled ? 'text-emerald-400' : 'text-slate-500'}
                            />
                          </IconBtn>
                          <IconBtn title="Edit" onClick={() => setEditing(cam)}>
                            <Pencil size={15} />
                          </IconBtn>
                          <IconBtn
                            title="Delete"
                            onClick={() => {
                              if (confirm(`Delete camera "${cam.name}" and all its recordings?`))
                                del.mutate(cam.id);
                            }}
                          >
                            <Trash2 size={15} className="text-red-400" />
                          </IconBtn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <CameraFormModal
          camera={editing === 'new' ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
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
      onClick={onClick}
      className="rounded p-1.5 text-slate-400 transition hover:bg-surface-700 hover:text-white"
    >
      {children}
    </button>
  );
}

function CameraFormModal({
  camera,
  groups,
  onClose,
  onSaved,
}: {
  camera: Camera | null;
  groups: CameraGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CameraForm>(
    camera
      ? {
          name: camera.name,
          location: camera.location,
          rtspUrl: camera.rtspUrl ?? '',
          groupId: camera.groupId ?? '',
          resolution: camera.resolution,
          fps: camera.fps,
          transcode: camera.transcode,
          motionDetection: camera.motionDetection,
          continuousRecording: camera.continuousRecording,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');

  const set = <K extends keyof CameraForm>(k: K, v: CameraForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let groupId = form.groupId || undefined;
      if (newGroup.trim()) {
        const g = await api.post('/cameras/groups', { name: newGroup.trim() });
        groupId = g.data.id;
      }
      const payload = { ...form, groupId, fps: Number(form.fps) };
      if (camera) await api.put(`/cameras/${camera.id}`, payload);
      else await api.post('/cameras', payload);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const testUrl = async () => {
    setTestMsg('…testing');
    try {
      const r = await api.post(`/cameras/${camera?.id ?? 'new'}/test`, { rtspUrl: form.rtspUrl });
      setTestMsg(
        r.data.ok
          ? `✓ ${r.data.codec} ${r.data.width}x${r.data.height} @ ${r.data.fps}fps`
          : `✗ ${r.data.error}`,
      );
    } catch (e) {
      setTestMsg(`✗ ${apiErrorMessage(e)}`);
    }
  };

  return (
    <Modal title={camera ? `Edit ${camera.name}` : 'Add Camera'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Camera Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label">RTSP URL</label>
          <div className="flex gap-2">
            <input
              className="input font-mono text-xs"
              value={form.rtspUrl}
              onChange={(e) => set('rtspUrl', e.target.value)}
              placeholder="rtsp://user:pass@host:554/stream"
              required
            />
            <button type="button" className="btn-ghost shrink-0" onClick={testUrl}>
              <Plug size={14} /> Test
            </button>
          </div>
          {testMsg && (
            <p
              className={`mt-1 text-xs ${testMsg.startsWith('✓') ? 'text-emerald-300' : testMsg.startsWith('✗') ? 'text-red-300' : 'text-slate-400'}`}
            >
              {testMsg}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Group</label>
            <select
              className="input"
              value={form.groupId}
              onChange={(e) => set('groupId', e.target.value)}
            >
              <option value="">— none —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">…or create group</label>
            <input
              className="input"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="New group name"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Resolution</label>
            <input
              className="input"
              value={form.resolution}
              onChange={(e) => set('resolution', e.target.value)}
            />
          </div>
          <div>
            <label className="label">FPS</label>
            <input
              className="input"
              type="number"
              min={1}
              max={120}
              value={form.fps}
              onChange={(e) => set('fps', parseInt(e.target.value) || 15)}
            />
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-surface-700 p-3">
          <Toggle
            label="Continuous recording"
            hint="Record 24/7 in segments while camera is enabled"
            checked={form.continuousRecording}
            onChange={(v) => set('continuousRecording', v)}
          />
          <Toggle
            label="Motion detection"
            hint="Scene-change analysis creates events + event recordings"
            checked={form.motionDetection}
            onChange={(v) => set('motionDetection', v)}
          />
          <Toggle
            label="Transcode to H.264"
            hint="Enable when source codec is not browser-playable (e.g. H.265)"
            checked={form.transcode}
            onChange={(v) => set('transcode', v)}
          />
        </div>
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
            {busy ? 'Saving…' : camera ? 'Save changes' : 'Add camera'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-sky-500"
      />
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
