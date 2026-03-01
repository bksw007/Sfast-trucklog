import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardCheck, LogOut, Moon, Sun, UserCircle2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
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
  const { theme, toggleTheme } = useTheme();
  const { logout, userProfile } = useAuth();
  const location = useLocation();
  const isDark = theme === 'dark';
  const nickname =
    userProfile?.nickname?.trim() ||
    userProfile?.displayName?.trim() ||
    userProfile?.email?.split('@')[0] ||
    'พนักงาน';

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'
      }`}
    >
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur ${
          isDark ? 'border-dark-muted/25 bg-dark-card/85' : 'border-light-muted/25 bg-white/90'
        }`}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-xl bg-white shadow-lg shadow-accent-primary/20">
              <img src="/icons/truck-logo.png" alt="SFast Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">S Fast Trucklog</p>
              <p className={`truncate text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                หวัดดี คุณ {nickname}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/driver/profile"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                location.pathname === '/driver/profile'
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              aria-label="Open profile"
            >
              {userProfile?.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName || 'profile'}
                  className="h-8 w-8 rounded-full border-2 border-emerald-500 object-cover"
                />
              ) : (
                <UserCircle2 size={20} />
              )}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-xl p-2 transition ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-slate-600" />}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl bg-red-500/10 p-2 text-red-500 transition hover:bg-red-500/20"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-4">{children}</main>

      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 border-t ${
          isDark ? 'border-dark-muted/30 bg-dark-card/95' : 'border-light-muted/30 bg-white/95'
        } backdrop-blur`}
      >
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-1 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium transition ${
                  isActive
                    ? 'bg-accent-primary/15 text-accent-primary'
                    : isDark
                      ? 'text-dark-muted hover:bg-white/5'
                      : 'text-light-muted hover:bg-black/5'
                }`}
              >
                <Icon size={16} />
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
