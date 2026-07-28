import clsx from 'clsx';
import {
  Activity,
  Camera,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
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
  // Mobile: sidebar becomes a slide-in drawer (hamburger in the top bar).
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r border-surface-700/60 bg-surface-900 transition-transform duration-200 md:static md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-surface-800 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
            <Video size={19} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-wide text-white">VMS</p>
            <p className="text-[10px] font-medium uppercase leading-tight tracking-wider text-slate-500">
              Video Management
            </p>
          </div>
        </div>
        <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-400 hover:bg-surface-800/70 hover:text-slate-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                  )}
                  <span
                    className={clsx(
                      'transition-transform',
                      isActive ? 'scale-105' : 'group-hover:scale-105',
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                  {item.to === '/events' && alarmCount > 0 && (
                    <span
                      className="ml-auto rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300 ring-1 ring-red-500/30"
                      onClick={() => setAlarmCount(0)}
                    >
                      {alarmCount > 99 ? '99+' : alarmCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-surface-800 p-3">
          <div className="mb-2.5 flex items-center gap-2 rounded-md bg-surface-850 px-2.5 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight text-slate-200">
                {user.fullName}
              </p>
              <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-accent/90">
                {user.role}
              </p>
            </div>
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile-only top bar with drawer toggle */}
        <div className="flex items-center gap-3 border-b border-surface-700/60 bg-surface-900 px-4 py-2.5 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-slate-300 hover:bg-surface-800"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Video size={16} className="text-accent" />
            <span className="text-sm font-bold text-white">VMS</span>
          </div>
        </div>

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
    </div>
  );
}
