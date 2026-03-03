import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Table2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  User,
  Users,
  ClipboardList,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UserProfileModal from './UserProfileModal';
import UserManagementModal from './UserManagementModal';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, userProfile, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showMobileTopMenu, setShowMobileTopMenu] = useState(false);

  const navItems = [
    { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
    { path: '/today', label: 'งานวันนี้', icon: ClipboardList },
    { path: '/data', label: 'ข้อมูลงานวิ่ง', icon: Table2 },
    { path: '/settings', label: 'ตั้งค่า', icon: Settings },
  ];

  const appLogo = '/icons/truck-logo.png';
  const desktopActionClass = (isDanger = false) => `driver-desktop-nav-item w-full whitespace-nowrap transition-all duration-200 ${
    sidebarOpen ? 'justify-start gap-3 px-4 py-3' : 'driver-desktop-nav-item-collapsed py-3'
  } ${isDanger ? 'text-rose-500 hover:text-rose-600' : 'text-slate-500 hover:text-[#2f4658]'}`;

  useEffect(() => {
    setShowMobileTopMenu(false);
  }, [location.pathname]);

  return (
    <div className="admin-clay min-h-screen font-sans text-slate-700">
      <header className="md:hidden sticky top-0 z-50 px-3 pb-1 pt-3">
        <div className="driver-top-shell mx-auto flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-2xl bg-[#272727] shadow-[6px_6px_12px_rgba(166,180,200,0.35),-6px_-6px_12px_rgba(255,255,255,0.9)]">
              <img src={appLogo} alt="SFast Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-tight text-[#34495e]">S Fast Trucklog</p>
              <p className="truncate text-sm font-semibold text-slate-500">Admin Workspace</p>
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
              {showMobileTopMenu ? <X size={18} className="text-slate-600" /> : <Menu size={18} className="text-slate-600" />}
            </button>

            {showMobileTopMenu && (
              <div
                id="admin-mobile-top-menu"
                className="absolute right-0 top-[calc(100%+0.55rem)] z-50 min-w-[190px] rounded-2xl border border-white/80 bg-[rgba(240,244,248,0.97)] p-2 shadow-[10px_10px_22px_rgba(166,180,200,0.36),-8px_-8px_18px_rgba(255,255,255,0.9)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileTopMenu(false);
                    setShowProfileModal(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#d9e6f2] hover:text-[#272727] active:bg-[#d9e6f2] active:text-[#272727]"
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
                    className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#d9e6f2] hover:text-[#272727] active:bg-[#d9e6f2] active:text-[#272727]"
                  >
                    <Users size={16} />
                    <span>จัดการผู้ใช้</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileTopMenu(false);
                    logout();
                  }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-500 transition hover:bg-rose-100/70"
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
        <aside className={`driver-desktop-sidebar hidden md:flex flex-col fixed left-0 top-0 h-screen transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[rgba(240,244,248,0.96)]`}>
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

          <nav className="flex-1 px-4 py-2 space-y-2 overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={!sidebarOpen ? item.label : ''}
                  className={`flex items-center px-4 py-3 rounded-xl transition-all duration-200 group whitespace-nowrap ${
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
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/85 overflow-x-hidden">
            <button
              onClick={() => setShowProfileModal(true)}
              title={!sidebarOpen ? 'โปรไฟล์' : ''}
              className={`${desktopActionClass()} mt-2`}
            >
              <User size={20} className="flex-shrink-0" />
              <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                โปรไฟล์
              </span>
            </button>

            {user?.uid && userProfile?.role === 'admin' && (
              <button
                onClick={() => setShowUserManagementModal(true)}
                title={!sidebarOpen ? 'จัดการผู้ใช้' : ''}
                className={`${desktopActionClass()} mt-2`}
              >
                <Users size={20} className="flex-shrink-0" />
                <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                  จัดการผู้ใช้
                </span>
              </button>
            )}

            <button
              onClick={logout}
              title={!sidebarOpen ? 'ออกจากระบบ' : ''}
              className={`${desktopActionClass(true)} mt-2`}
            >
              <LogOut size={20} className="flex-shrink-0" />
              <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                ออกจากระบบ
              </span>
            </button>

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`${desktopActionClass()} mt-2`}
            >
              <div className="flex-shrink-0">
                {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </div>
              <span className={`font-medium transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                ย่อเมนู
              </span>
            </button>
          </div>
        </aside>

        <main className={`flex-1 min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'md:ml-64' : 'md:ml-20'
        }`}>
          <div className="p-4 pb-[calc(5.2rem+env(safe-area-inset-bottom))] md:p-8 max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="driver-mobile-nav-surface mx-auto grid w-full max-w-6xl grid-cols-4 gap-2 rounded-[22px] border border-white/85 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition ${
                  isActive
                    ? 'driver-mobile-nav-item-active'
                    : 'text-slate-500 hover:bg-[#d9e6f2] hover:text-[#272727] active:bg-[#d9e6f2] active:text-[#272727]'
                }`}
              >
                <Icon size={16} className="driver-float-icon" />
                <span className="truncate">{item.label}</span>
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
