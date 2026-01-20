import React from 'react';
import { Loader2, Cloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface SyncModalProps {
  isOpen: boolean;
  status: 'syncing' | 'success' | 'error';
  onClose?: () => void;
  errorMessage?: string;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, status, onClose, errorMessage }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop with gradient */}
      <div className={`absolute inset-0 ${
        isDark 
          ? 'bg-gradient-to-br from-dark-bg via-purple-900/20 to-dark-bg' 
          : 'bg-gradient-to-br from-light-bg via-purple-100/50 to-light-bg'
      }`} />
      
      {/* Modal Content */}
      <div className={`relative w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-fade-in text-center ${
        isDark ? 'bg-dark-card/90 backdrop-blur-xl' : 'bg-light-card/90 backdrop-blur-xl'
      }`}>
        {/* Icon Animation */}
        <div className="mb-6 flex justify-center">
          {status === 'syncing' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent-primary/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg shadow-accent-primary/30">
                <Cloud className="text-white animate-pulse" size={36} />
              </div>
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 animate-bounce">
              <CheckCircle2 className="text-white" size={40} />
            </div>
          )}
          {status === 'error' && (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <AlertCircle className="text-white" size={40} />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {status === 'syncing' && 'กำลังซิงค์ข้อมูล'}
          {status === 'success' && 'ซิงค์สำเร็จ!'}
          {status === 'error' && 'เกิดข้อผิดพลาด'}
        </h2>

        {/* Description */}
        <p className={`text-sm mb-4 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
          {status === 'syncing' && 'กำลังเชื่อมต่อกับ Firebase...'}
          {status === 'success' && 'ข้อมูลอัพเดทล่าสุดแล้ว'}
          {status === 'error' && (errorMessage || 'ไม่สามารถเชื่อมต่อได้')}
        </p>

        {/* Loading Dots for syncing */}
        {status === 'syncing' && (
          <div className="flex justify-center gap-1 mt-4">
            <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Close Button for success/error */}
        {(status === 'success' || status === 'error') && onClose && (
          <button
            onClick={onClose}
            className={`mt-4 px-6 py-2 rounded-xl font-medium transition-all ${
              status === 'success'
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-accent-danger hover:brightness-110 text-white'
            }`}
          >
            {status === 'error' ? 'ลองใหม่' : 'ตกลง'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncModal;
