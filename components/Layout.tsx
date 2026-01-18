import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Table2, Truck, Sun, Moon, Menu, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { lastUpdate, syncing, refreshData } = useData();
  // Default to collapsed (false)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
    { path: '/entry', label: 'บันทึกงาน', icon: PlusCircle },
    { path: '/data', label: 'ข้อมูลงานวิ่ง', icon: Table2 },
  ];

  const isDark = theme === 'dark';

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'ไม่ทราบ';
    return date.toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      isDark ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'
    }`}>
      {/* Mobile Header */}
      <header className={`md:hidden fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between border-b transition-colors ${
        isDark ? 'bg-dark-card border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-lg flex items-center justify-center shadow-lg">
            <Truck className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-primary to-accent-secondary">
            SFast Trucklog
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
            }`}
          >
            {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
            }`}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide Menu */}
      <nav className={`md:hidden fixed top-14 right-0 z-50 w-64 h-[calc(100vh-56px)] transform transition-transform duration-300 ${
        mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isDark ? 'bg-dark-card' : 'bg-light-card shadow-xl'}`}>
        <div className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-accent-primary/20 text-accent-primary' 
                    : isDark 
                      ? 'text-dark-muted hover:bg-white/5 hover:text-dark-text'
                      : 'text-light-muted hover:bg-black/5 hover:text-light-text'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
        
        {/* Last Update - Mobile */}
        <div className={`absolute bottom-20 left-0 right-0 px-4 py-3 border-t ${
          isDark ? 'border-dark-muted/20' : 'border-light-muted/20'
        }`}>
          <div className={`text-xs ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            อัพเดทล่าสุด:
          </div>
          <div className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
            {formatLastUpdate(lastUpdate)}
          </div>
          <button
            onClick={() => {
              refreshData();
              setMobileMenuOpen(false);
            }}
            disabled={syncing}
            className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isDark 
                ? 'bg-white/5 hover:bg-white/10 text-dark-text' 
                : 'bg-black/5 hover:bg-black/10 text-light-text'
            } ${syncing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'กำลังซิงค์...' : 'รีเฟรช'}
          </button>
        </div>
      </nav>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden md:flex flex-col fixed left-0 top-0 h-screen border-r transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        } ${isDark ? 'bg-dark-card/50 border-dark-muted/20' : 'bg-light-card border-light-muted/20 shadow-sm'}`}>
          {/* Logo */}
          <div className={`p-6 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
            <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
              <div className="w-10 h-10 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-xl flex items-center justify-center shadow-lg shadow-accent-primary/20 flex-shrink-0">
                <Truck className="text-white" size={24} />
              </div>
              {sidebarOpen && (
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-primary to-accent-secondary whitespace-nowrap">
                  SFast Trucklog
                </h1>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-2 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    !sidebarOpen && 'justify-center'
                  } ${
                    isActive 
                      ? 'bg-accent-primary/20 text-accent-primary shadow-lg shadow-accent-primary/10' 
                      : isDark 
                        ? 'text-dark-muted hover:bg-white/5 hover:text-dark-text'
                        : 'text-light-muted hover:bg-black/5 hover:text-light-text'
                  }`}
                >
                  <Icon size={20} className={isActive ? 'text-accent-primary' : ''} />
                  {sidebarOpen && <span className="font-medium">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Last Update Section */}
          {sidebarOpen && (
            <div className={`mx-4 mb-4 p-3 rounded-xl ${
              isDark ? 'bg-dark-bg/50' : 'bg-light-bg/50'
            }`}>
              <div className={`text-xs mb-1 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                อัพเดทล่าสุด:
              </div>
              <div className={`text-sm font-medium mb-2 ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
                {formatLastUpdate(lastUpdate)}
              </div>
              <button
                onClick={refreshData}
                disabled={syncing}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  syncing
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:brightness-110'
                } bg-gradient-to-r from-accent-primary to-accent-secondary text-white`}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'กำลังซิงค์...' : 'รีเฟรช'}
              </button>
            </div>
          )}

          {/* Refresh button when collapsed */}
          {!sidebarOpen && (
            <div className="px-4 mb-4">
              <button
                onClick={refreshData}
                disabled={syncing}
                title="รีเฟรชข้อมูล"
                className={`w-full flex items-center justify-center p-3 rounded-xl transition-all ${
                  syncing
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:brightness-110'
                } bg-gradient-to-r from-accent-primary to-accent-secondary text-white`}
              >
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {/* Bottom Controls */}
          <div className={`p-4 border-t ${isDark ? 'border-dark-muted/20' : 'border-light-muted/20'}`}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                !sidebarOpen && 'justify-center'
              } ${isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
            >
              {isDark ? (
                <Sun size={20} className="text-yellow-400" />
              ) : (
                <Moon size={20} className="text-slate-600" />
              )}
              {sidebarOpen && (
                <span className={`font-medium ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                  {isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
                </span>
              )}
            </button>

            {/* Collapse Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all mt-2 ${
                !sidebarOpen && 'justify-center'
              } ${isDark ? 'hover:bg-white/5 text-dark-muted' : 'hover:bg-black/5 text-light-muted'}`}
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              {sidebarOpen && <span className="font-medium">ย่อเมนู</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 min-h-screen pt-16 md:pt-0 transition-all duration-300 ${
          sidebarOpen ? 'md:ml-64' : 'md:ml-20'
        }`}>
          <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;