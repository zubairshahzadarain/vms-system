import clsx from 'clsx';
import {
  Activity,
  Camera,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Radio,
  ScrollText,
  Search,
  Users as UsersIcon,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getSocket } from '../lib/socket';
import type { Role, VmsEvent } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/command-center', label: 'Command Center', icon: <Radio size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/live', label: 'Live View', icon: <MonitorPlay size={17} />, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
  { to: '/playback', label: 'Playback', icon: <Video size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/cameras', label: 'Cameras', icon: <Camera size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/events', label: 'Events', icon: <Activity size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/search', label: 'Search', icon: <Search size={17} />, roles: ['ADMIN', 'OPERATOR'] },
  { to: '/users', label: 'Users & Roles', icon: <UsersIcon size={17} />, roles: ['ADMIN'] },
  { to: '/audit', label: 'Audit Logs', icon: <ScrollText size={17} />, roles: ['ADMIN'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [alarmCount, setAlarmCount] = useState(0);
  const [toast, setToast] = useState<VmsEvent | null>(null);

  useEffect(() => {
    if (!user || user.role === 'VIEWER') return;
    const socket = getSocket();
    const onEvent = (event: VmsEvent) => {
      if (event.severity !== 'INFO' && event.status === 'OPEN') {
        setAlarmCount((c) => c + 1);
        setToast(event);
        setTimeout(() => setToast((t) => (t?.id === event.id ? null : t)), 5000);
      }
    };
    socket.on('event.new', onEvent);
    return () => {
      socket.off('event.new', onEvent);
    };
  }, [user]);

  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-surface-700/60 bg-surface-900">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Video size={20} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">VMS</p>
            <p className="text-[11px] leading-tight text-slate-500">Video Management</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200',
                )
              }
            >
              {item.icon}
              {item.label}
              {item.to === '/events' && alarmCount > 0 && (
                <span
                  className="ml-auto rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300"
                  onClick={() => setAlarmCount(0)}
                >
                  {alarmCount > 99 ? '99+' : alarmCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-surface-700/60 p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-[13px] font-semibold text-slate-200">{user.fullName}</p>
            <p className="text-[11px] uppercase tracking-wide text-accent/80">{user.role}</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="btn-ghost w-full py-1.5 text-[13px]"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto p-5">
        <Outlet />
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 w-80 animate-pulse-none">
            <div
              className={clsx(
                'card border-l-4 p-3',
                toast.severity === 'CRITICAL' ? 'border-l-red-500' : 'border-l-amber-400',
              )}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {toast.type.replaceAll('_', ' ')}
              </p>
              <p className="mt-0.5 text-sm text-slate-200">{toast.description}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
