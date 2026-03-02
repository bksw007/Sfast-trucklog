import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DriverLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/driver/today', label: 'งานวันนี้', icon: CalendarDays },
  { path: '/driver/ready-to-close', label: 'รอจบงาน', icon: ClipboardCheck },
  { path: '/driver/history', label: 'สรุปงาน', icon: CheckCircle2 },
  { path: '/driver/profile', label: 'โปรไฟล์', icon: UserCircle2 },
];

const DriverLayout: React.FC<DriverLayoutProps> = ({ children }) => {
  const { logout, userProfile } = useAuth();
  const location = useLocation();
  const nickname =
    userProfile?.nickname?.trim() ||
    userProfile?.displayName?.trim() ||
    userProfile?.email?.split('@')[0] ||
    'พนักงาน';

  return (
    <div className="driver-clay min-h-screen text-slate-700">
      <aside className="driver-desktop-sidebar fixed inset-y-0 left-0 z-40 hidden p-5 md:flex md:flex-col">
        <div className="flex h-full flex-col gap-4 rounded-[26px] border border-white/80 p-4 shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
          <div className="flex items-center gap-3 px-1 py-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#272727] shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
              <img src="/icons/truck-logo.png" alt="SFast Logo" className="h-10 w-10 object-cover" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-[#34495e]">S Fast Trucklog</p>
              <p className="text-xs font-semibold text-slate-500">Driver Workspace</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`driver-desktop-nav-item ${isActive ? 'driver-desktop-nav-item-active' : ''}`}
                >
                  <Icon size={19} className="driver-float-icon" />
                  <span className="text-sm font-bold">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="driver-clay-soft mt-auto rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-white">
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName || 'profile'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#aec6cf] text-[#34495e]">
                    <UserCircle2 size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#34495e]">{nickname}</p>
                <p className="truncate text-xs text-slate-500">พนักงานขับรถ</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="driver-clay-icon-btn ml-auto h-9 w-9 text-rose-500"
                aria-label="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:ml-[270px]">
        <header className="sticky top-0 z-40 px-3 pb-1 pt-3 sm:px-4 md:px-6 md:pt-5">
          <div className="driver-top-shell mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-[24px] border border-white/80 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-2xl bg-[#272727] shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
                <img src="/icons/truck-logo.png" alt="SFast Logo" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black tracking-tight text-[#34495e]">S Fast Trucklog</p>
                <p className="truncate text-sm font-semibold text-slate-500">หวัดดี คุณ {nickname}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/driver/profile"
                className={`driver-clay-icon-btn ${location.pathname === '/driver/profile' ? 'ring-2 ring-[#82b4d6]' : ''}`}
                aria-label="Open profile"
              >
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName || 'profile'}
                    className="h-9 w-9 rounded-full border-2 border-emerald-400 object-cover"
                  />
                ) : (
                  <UserCircle2 size={20} className="text-slate-500" />
                )}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="driver-clay-icon-btn text-rose-500 md:hidden"
                aria-label="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-4 md:px-6">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="driver-mobile-nav-surface mx-auto grid w-full max-w-6xl grid-cols-4 gap-2 rounded-[26px] border border-white/85 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 rounded-2xl px-1.5 py-2 text-[10px] font-semibold transition ${
                  isActive
                    ? 'driver-mobile-nav-item-active'
                    : 'text-slate-500 hover:bg-white/55'
                }`}
              >
                <Icon size={17} className="driver-float-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default DriverLayout;
