import { Video } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';

const DEMO_ACCOUNTS = [
  { u: 'admin', p: 'Admin@123', role: 'Administrator' },
  { u: 'operator', p: 'Operator@123', role: 'Operator' },
  { u: 'viewer', p: 'Viewer@123', role: 'Viewer' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-950 p-4">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent)]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Video size={26} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Video Management System</h1>
          <p className="section-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Central Security Command Center
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="card mt-4 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Demo accounts
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.u}
                onClick={() => {
                  setUsername(a.u);
                  setPassword(a.p);
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-slate-300 transition hover:bg-surface-800/80"
              >
                <span className="font-mono text-accent/90">{a.u}</span>
                <span className="text-xs text-slate-500">{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
