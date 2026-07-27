import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { homeFor, useAuth } from './lib/auth';
import type { Role } from './lib/types';
import AuditLogs from './pages/AuditLogs';
import Cameras from './pages/Cameras';
import CommandCenter from './pages/CommandCenter';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import LiveView from './pages/LiveView';
import Login from './pages/Login';
import Playback from './pages/Playback';
import SearchPage from './pages/SearchPage';
import Users from './pages/Users';

function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Guard roles={['ADMIN', 'OPERATOR', 'VIEWER']}>
            <Layout />
          </Guard>
        }
      >
        <Route
          path="/dashboard"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <Dashboard />
            </Guard>
          }
        />
        <Route path="/live" element={<LiveView />} />
        <Route
          path="/command-center"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <CommandCenter />
            </Guard>
          }
        />
        <Route
          path="/cameras"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <Cameras />
            </Guard>
          }
        />
        <Route
          path="/playback"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <Playback />
            </Guard>
          }
        />
        <Route
          path="/events"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <Events />
            </Guard>
          }
        />
        <Route
          path="/search"
          element={
            <Guard roles={['ADMIN', 'OPERATOR']}>
              <SearchPage />
            </Guard>
          }
        />
        <Route
          path="/users"
          element={
            <Guard roles={['ADMIN']}>
              <Users />
            </Guard>
          }
        />
        <Route
          path="/audit"
          element={
            <Guard roles={['ADMIN']}>
              <AuditLogs />
            </Guard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={homeFor(user?.role)} replace />} />
    </Routes>
  );
}
