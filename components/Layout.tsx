import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Table2,
  LogOut,
  Moon,
  Settings,
  SunMedium,
  User,
  Users,
  ClipboardList,
  Menu,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import UserProfileModal from './UserProfileModal';
import UserManagementModal from './UserManagementModal';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, userProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showMobileTopMenu, setShowMobileTopMenu] = useState(false);
  const [showDesktopUtilityMenu, setShowDesktopUtilityMenu] = useState(false);
  const isDark = theme === 'dark';

  const navItems = [
    { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
    { path: '/today', label: 'งานวันนี้', icon: ClipboardList },
    { path: '/data', label: 'ข้อมูลงานวิ่ง', icon: Table2 },
    { path: '/settings', label: 'ตั้งค่า', icon: Settings },
  ];

  const appLogo = '/icons/truck-logo.png';
  const mobileHeaderTitleClass = isDark ? 'truncate text-lg font-black tracking-tight text-[#eef3ff]' : 'truncate text-lg font-black tracking-tight text-[#34495e]';
  const mobileHeaderSubtitleClass = isDark ? 'truncate text-sm font-semibold text-[#95a1c8]' : 'truncate text-sm font-semibold text-slate-500';
  const mobileMenuIconClass = isDark ? 'text-[#cbd5f5]' : 'text-slate-600';
  const mobileTopMenuPanelClass = isDark
    ? 'absolute right-0 top-[calc(100%+0.55rem)] z-50 w-[min(84vw,16rem)] rounded-2xl border border-[rgba(91,104,146,0.45)] bg-[rgba(29,34,51,0.96)] p-2 shadow-[16px_16px_28px_rgba(7,10,18,0.52),-10px_-10px_22px_rgba(57,67,99,0.18)]'
    : 'absolute right-0 top-[calc(100%+0.55rem)] z-50 w-[min(84vw,16rem)] rounded-2xl border border-white/80 bg-[rgba(240,244,248,0.97)] p-2 shadow-[10px_10px_22px_rgba(166,180,200,0.36),-8px_-8px_18px_rgba(255,255,255,0.9)]';
  const mobileTopMenuItemClass = isDark
    ? 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#eef3ff] transition hover:bg-white/10 hover:text-white active:bg-white/10 active:text-white'
    : 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#d9e6f2] hover:text-[#272727] active:bg-[#d9e6f2] active:text-[#272727]';
  const mobileTopMenuDangerItemClass = isDark
    ? 'mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15 hover:text-rose-200'
    : 'mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-500 transition hover:bg-rose-100/70';
  const desktopActionClass = (isDanger = false) => `driver-desktop-nav-item w-full whitespace-nowrap transition-all duration-200 ${
    sidebarOpen ? 'justify-start gap-3 px-4 py-3' : 'driver-desktop-nav-item-collapsed py-3'
  } ${isDanger ? 'text-rose-500 hover:text-rose-600' : 'text-slate-500 hover:text-[#2f4658]'}`;
  const desktopUtilityItemClass = (isDanger = false) =>
    `driver-desktop-nav-item w-full justify-start gap-3 px-4 py-3 whitespace-nowrap transition-all duration-200 ${
      isDanger ? 'text-rose-500 hover:text-rose-600' : 'text-slate-500 hover:text-[#2f4658]'
    }`;
  const desktopUtilityPanelClass = isDark
    ? 'border border-[rgba(91,104,146,0.42)] bg-[rgba(29,34,51,0.96)] shadow-[14px_14px_28px_rgba(7,10,18,0.5),-10px_-10px_22px_rgba(57,67,99,0.16)]'
    : 'border border-white/85 bg-[rgba(240,244,248,0.97)] shadow-[10px_10px_22px_rgba(166,180,200,0.34),-8px_-8px_18px_rgba(255,255,255,0.88)]';

  const stopSidebarToggle = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleSidebarToggle = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (!next) {
        setShowDesktopUtilityMenu(false);
      }
      return next;
    });
  };

  const toggleDesktopUtilityMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setShowDesktopUtilityMenu((prev) => !prev);
  };

  useEffect(() => {
    setShowMobileTopMenu(false);
    setShowDesktopUtilityMenu(false);
  }, [location.pathname]);

  return (
    <div className={`admin-clay min-h-screen font-sans ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
      <header className="sticky top-0 z-50 px-3 pb-1 pt-3 md:hidden">
        <div className="driver-top-shell mx-auto flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-2xl bg-[#272727] shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
              <img src={appLogo} alt="SFast Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className={mobileHeaderTitleClass}>S Fast Trucklog</p>
              <p className={mobileHeaderSubtitleClass}>Admin Workspace</p>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMobileTopMenu((prev) => !prev)}
              className="driver-clay-icon-btn"
              aria-label="Open menu"
              aria-expanded={showMobileTopMenu}
              aria-controls="admin-mobile-top-menu"
            >
              {showMobileTopMenu ? <X size={18} className={mobileMenuIconClass} /> : <Menu size={18} className={mobileMenuIconClass} />}
            </button>

            {showMobileTopMenu && (
              <div
                id="admin-mobile-top-menu"
                className={mobileTopMenuPanelClass}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileTopMenu(false);
                    setShowProfileModal(true);
                  }}
                  className={mobileTopMenuItemClass}
                >
                  <User size={16} />
                  <span>โปรไฟล์</span>
                </button>

                {user?.uid && userProfile?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileTopMenu(false);
                      setShowUserManagementModal(true);
                    }}
                    className={`mt-1 ${mobileTopMenuItemClass}`}
                  >
                    <Users size={16} />
                    <span>จัดการผู้ใช้</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setShowMobileTopMenu(false);
                  }}
                  className={`mt-1 ${mobileTopMenuItemClass}`}
                >
                  {isDark ? <SunMedium size={16} /> : <Moon size={16} />}
                  <span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileTopMenu(false);
                    logout();
                  }}
                  className={mobileTopMenuDangerItemClass}
                >
                  <LogOut size={16} />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <aside
          onClick={handleSidebarToggle}
          className={`driver-desktop-sidebar hidden cursor-pointer md:flex flex-col fixed left-0 top-0 h-screen transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[rgba(240,244,248,0.96)]`}
          aria-label={sidebarOpen ? 'คลิกเพื่อย่อเมนูด้านข้าง' : 'คลิกเพื่อขยายเมนูด้านข้าง'}
        >
          <div className={`p-6 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
            <div className={`flex items-center transition-all duration-300 ${sidebarOpen ? 'gap-3' : 'gap-0 justify-center'}`}>
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-accent-primary/20 flex-shrink-0 bg-[#272727]">
                <img src={appLogo} alt="SFast Logo" className="w-full h-full object-cover" />
              </div>
              <div className={`overflow-hidden transition-all duration-300 ${sidebarOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'}`}>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-primary to-accent-secondary whitespace-nowrap">
                  SFast Trucklog
                </h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-visible px-4 py-2 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={!sidebarOpen ? item.label : ''}
                  onClick={stopSidebarToggle}
                  className={`relative flex items-center px-4 py-3 rounded-xl transition-all duration-200 group whitespace-nowrap ${
                    sidebarOpen ? 'gap-3' : 'driver-desktop-nav-item-collapsed'
                  } driver-desktop-nav-item ${
                    isActive
                      ? 'driver-desktop-nav-item-active text-[#2f4658]'
                      : 'text-slate-500 hover:text-[#2f4658]'
                  }`}
                >
                  <Icon size={20} className={`flex-shrink-0 ${isActive ? 'text-accent-primary' : ''}`} />
                  <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                    {item.label}
                  </span>
                  {!sidebarOpen && (
                    <span className={`pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-semibold opacity-0 shadow-lg transition-all duration-200 group-hover:block group-hover:opacity-100 ${desktopUtilityPanelClass}`}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div
            onClick={stopSidebarToggle}
            className="relative overflow-visible p-4 border-t border-white/85"
          >
            <button
              onClick={toggleDesktopUtilityMenu}
              title={!sidebarOpen ? 'เมนูเพิ่มเติม' : ''}
              className={`${desktopActionClass()} relative mt-2 group`}
            >
              <MoreHorizontal size={20} className="flex-shrink-0" />
              <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                เมนูเพิ่มเติม
              </span>
              {!sidebarOpen && (
                <span className={`pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-semibold opacity-0 shadow-lg transition-all duration-200 group-hover:block group-hover:opacity-100 ${desktopUtilityPanelClass}`}>
                  เมนูเพิ่มเติม
                </span>
              )}
            </button>

            {showDesktopUtilityMenu && (
              <div
                className={`mt-2 rounded-[1.4rem] p-2 ${desktopUtilityPanelClass} ${
                  sidebarOpen ? 'space-y-2' : 'absolute bottom-4 left-[calc(100%+0.75rem)] w-60'
                }`}
              >
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowProfileModal(true);
                  }}
                  className={desktopUtilityItemClass()}
                >
                  <User size={20} className="flex-shrink-0" />
                  <span className="font-medium">โปรไฟล์</span>
                </button>

                {user?.uid && userProfile?.role === 'admin' && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowUserManagementModal(true);
                    }}
                    className={desktopUtilityItemClass()}
                  >
                    <Users size={20} className="flex-shrink-0" />
                    <span className="font-medium">จัดการผู้ใช้</span>
                  </button>
                )}

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleTheme();
                  }}
                  className={desktopUtilityItemClass()}
                >
                  {isDark ? <SunMedium size={20} className="flex-shrink-0" /> : <Moon size={20} className="flex-shrink-0" />}
                  <span className="font-medium">{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    logout();
                  }}
                  className={desktopUtilityItemClass(true)}
                >
                  <LogOut size={20} className="flex-shrink-0" />
                  <span className="font-medium">ออกจากระบบ</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className={`flex-1 min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'md:ml-64' : 'md:ml-20'
        }`}>
          <div className="mx-auto max-w-7xl space-y-5 p-3 pb-[calc(5.2rem+env(safe-area-inset-bottom))] sm:p-4 md:space-y-6 md:p-8">
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="driver-mobile-nav-surface mx-auto grid w-full max-w-6xl grid-cols-4 gap-1.5 rounded-[22px] border border-white/85 p-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`driver-mobile-nav-link flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 transition ${
                  isActive
                    ? 'driver-mobile-nav-item-active'
                    : 'hover:bg-[#d9e6f2] active:bg-[#d9e6f2]'
                }`}
              >
                <Icon size={17} className="driver-float-icon shrink-0" />
                <span className="driver-mobile-nav-label truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <UserManagementModal
        isOpen={showUserManagementModal}
        onClose={() => setShowUserManagementModal(false)}
      />
    </div>
  );
};

export default Layout;
